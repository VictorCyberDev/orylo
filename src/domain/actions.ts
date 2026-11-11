/**
 * ACTION GATEWAY — the only code path that changes anything in a customer's world.
 *
 * It is independent of any conversational layer (portal, eGain, operator UI): callers supply a typed
 * operation + idempotency key and the gateway decides, using only structured, approved policy RULES,
 * server-side identity and the provider's current state. Nothing a model or a document says can
 * widen what it will do.
 *
 * Pipeline: validate → actor/org/customer scope → authorization → policy authority (+currency) →
 * consent/approval → current-state check → idempotent execute (attempt records, timeout, safe retry)
 * → signed receipt → read-after-write verification → ledger → objective/case state.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  actionApprovals,
  actionAttempts,
  actionReceipts,
  actionRequests,
  caseEvidence,
  caseEvents,
  customers,
  organizations,
  resolutionCases,
  type CaseRow,
} from "@/db/schema";
import type { DbOrTx } from "@/db";
import { db as rootDb } from "@/db";
import { AppError, forbidden, notFound, type ErrorCode } from "./errors";
import { actorCustomerId, assertCanAct, systemCtx, type Ctx } from "./context";
import {
  appendEvent,
  assertCaseAccess,
  getObjectives,
  lockCase,
  mapDbError,
  setObjective,
  transitionCase,
} from "./cases";
import { activeRules, isVersionCurrent } from "./policy";
import { appendLedger } from "./ledger";
import { canonicalJson, hmacHex, safeEqualHex, sha256Hex, signingKey } from "./crypto";
import { requirePermission } from "./rbac";
import { audit } from "./audit";
import { notifyCustomer, notifyRoles } from "./notifications";
import { escalateCase } from "./escalation";
import { backoffMs, enqueueJob } from "@/jobs/queue";
import {
  AdapterError,
  accountStateHash,
  getSubscriptionProvider,
  type MutationResult,
  type SubscriptionProvider,
} from "@/adapters/subscription";
import { usageRecords } from "@/db/schema";

type RuleMap = Record<string, string | number | boolean>;
type ReqRow = typeof actionRequests.$inferSelect;

interface RunCtx {
  tx: DbOrTx;
  ctx: Ctx;
  orgId: string;
  caseRow: CaseRow;
  req: Pick<ReqRow, "id" | "caseId" | "customerId">;
  input: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by the op's zod schema
  provider: SubscriptionProvider;
  extKey: string;
  rules: RuleMap;
}
interface Assessment {
  stateHash?: string;
  amountCents?: number;
}
interface Verification {
  verified: boolean;
  method: string;
  evidence: Record<string, unknown>;
  summary: string;
}
interface OpDef {
  /** Internal ops write inside the gateway transaction and must NOT be abandoned by a timeout race. */
  internal?: boolean;
  label: string;
  schema: z.ZodType<Record<string, unknown>>;
  objectiveKey: string;
  requiredRules: string[];
  customerConsent: boolean;
  operatorOnly: boolean;
  consentText(input: Record<string, any>): string; // eslint-disable-line @typescript-eslint/no-explicit-any
  assess(rc: RunCtx): Promise<Assessment>;
  run(rc: RunCtx, a: Assessment): Promise<MutationResult>;
  verify(rc: RunCtx, r: MutationResult): Promise<Verification>;
}

const denied = (m: string, d?: Record<string, unknown>) => new AppError("POLICY_DENIED", m, d);
const DAY = 86_400_000;
const CONSENT_TTL_MS = 72 * 3_600_000; // a confirmation is valid for 72 hours

async function ownedAccount(rc: RunCtx) {
  const acct = await rc.provider.readAccount(rc.orgId, rc.input.accountNumber);
  // Unknown OR another customer's account both look like "not found": never confirm someone else's account exists.
  if (!acct || acct.customerId !== rc.caseRow.customerId) throw notFound("Subscription account");
  return acct;
}

export const OPERATIONS: Record<string, OpDef> = {
  "subscription.correct_cancellation": {
    label: "Apply your earlier cancellation",
    schema: z.object({ accountNumber: z.string().min(3).max(40) }).strict(),
    objectiveKey: "stop_future_billing",
    requiredRules: ["cancellation.correction_allowed", "cancellation.correction_window_days"],
    customerConsent: true,
    operatorOnly: false,
    consentText: (i) =>
      `I confirm I asked to cancel account ${i.accountNumber} and I authorise ${"the provider"} to apply that cancellation now, effective from my original request date, so future billing stops.`,
    async assess(rc) {
      if (rc.rules["cancellation.correction_allowed"] !== true)
        throw denied("Policy does not currently allow cancellation corrections.");
      const acct = await ownedAccount(rc);
      if (acct.status !== "ACTIVE")
        throw new AppError("STALE_STATE", "This account is already cancelled — nothing to correct.");
      const prior = (await rc.provider.readCancellationRequests(rc.orgId, acct.accountId)).filter(
        (r) => r.status !== "PROCESSED",
      );
      if (!prior.length)
        throw denied("We found no earlier cancellation request to apply, so we can't change this account.");
      const win = Number(rc.rules["cancellation.correction_window_days"]);
      if (Date.now() - prior[0].requestedAt.getTime() > win * DAY)
        throw denied(`The earlier request is older than the ${win}-day correction window.`);
      return { stateHash: accountStateHash(acct) };
    },
    async run(rc) {
      const acct = await ownedAccount(rc);
      const prior = (await rc.provider.readCancellationRequests(rc.orgId, acct.accountId)).filter(
        (r) => r.status !== "PROCESSED",
      );
      return rc.provider.correctCancellation({
        orgId: rc.orgId,
        accountId: acct.accountId,
        expectedVersion: acct.version,
        externalKey: rc.extKey,
        effectiveAt: prior[prior.length - 1]?.requestedAt ?? new Date(),
      });
    },
    async verify(rc) {
      const acct = await ownedAccount(rc);
      const ok = acct.status === "CANCELLED" && acct.billingActive === false;
      return {
        verified: ok,
        method: "read_after_write:subscription_account",
        evidence: {
          accountNumber: acct.accountNumber,
          status: acct.status,
          billingActive: acct.billingActive,
          providerVersion: acct.version,
        },
        summary: ok
          ? "Provider now shows the account as cancelled with billing stopped."
          : "Provider still shows the account as active.",
      };
    },
  },

  "subscription.create_billing_review": {
    label: "Open a billing review for the charge",
    schema: z.object({ accountNumber: z.string().min(3).max(40), chargeId: z.string().uuid() }).strict(),
    objectiveKey: "billing_review_submitted",
    requiredRules: ["billing.review_allowed", "billing.review_window_days"],
    customerConsent: true,
    operatorOnly: false,
    consentText: () =>
      "I ask for the disputed charge to be reviewed by the billing team. I understand this opens a review — it does not refund anything by itself.",
    async assess(rc) {
      if (rc.rules["billing.review_allowed"] !== true)
        throw denied("Policy does not currently allow billing reviews.");
      const acct = await ownedAccount(rc);
      const ch = (await rc.provider.readCharges(rc.orgId, acct.accountId)).find(
        (c) => c.id === rc.input.chargeId,
      );
      if (!ch) throw notFound("Charge");
      const win = Number(rc.rules["billing.review_window_days"]);
      if (Date.now() - ch.chargedAt.getTime() > win * DAY)
        throw denied(`That charge is outside the ${win}-day review window.`);
      return { amountCents: ch.amountCents, stateHash: undefined };
    },
    async run(rc) {
      const acct = await ownedAccount(rc);
      return rc.provider.createBillingReview({
        orgId: rc.orgId,
        accountId: acct.accountId,
        chargeId: rc.input.chargeId,
        externalKey: rc.extKey,
      });
    },
    async verify(rc, r) {
      const rv = await rc.provider.readBillingReview(rc.orgId, rc.input.chargeId);
      const ok = !!rv && rv.externalRef === r.externalRef;
      return {
        verified: ok,
        method: "read_after_write:billing_review",
        evidence: { reviewRef: rv?.externalRef, reviewStatus: rv?.status, moneyMoved: false },
        summary: ok
          ? "A billing review exists for this charge. No money has moved; a person will decide the outcome."
          : "The billing review could not be found at the provider.",
      };
    },
  },

  "billing.record_review_decision": {
    label: "Record the billing team's decision",
    schema: z
      .object({
        accountNumber: z.string().min(3).max(40),
        chargeId: z.string().uuid(),
        decision: z.enum(["APPROVED_FOR_REFUND_PROCESSING", "DENIED"]),
      })
      .strict(),
    objectiveKey: "charge_disposition",
    requiredRules: ["refund.automatic_refund_allowed"],
    customerConsent: false,
    operatorOnly: true,
    consentText: () => "",
    async assess(rc) {
      if (rc.rules["refund.automatic_refund_allowed"] !== false)
        throw denied("Policy configuration is unsafe: automatic refunds must be disallowed.");
      const acct = await ownedAccount(rc);
      // The charge must belong to THIS case's account — never decide another customer's review.
      const ch = (await rc.provider.readCharges(rc.orgId, acct.accountId)).find(
        (c) => c.id === rc.input.chargeId,
      );
      if (!ch) throw notFound("Charge");
      const rv = await rc.provider.readBillingReview(rc.orgId, rc.input.chargeId);
      if (!rv) throw new AppError("STALE_STATE", "There is no billing review to decide for this charge.");
      if (rv.status === "DECIDED") throw new AppError("STALE_STATE", "This review has already been decided.");
      return {};
    },
    async run(rc) {
      return rc.provider.recordReviewDecision({
        orgId: rc.orgId,
        chargeId: rc.input.chargeId,
        decision: rc.input.decision as "DENIED",
        externalKey: rc.extKey,
      });
    },
    async verify(rc) {
      const rv = await rc.provider.readBillingReview(rc.orgId, rc.input.chargeId);
      const ok = rv?.status === "DECIDED" && rv.decision === rc.input.decision;
      return {
        verified: ok,
        method: "read_after_write:billing_review_decision",
        evidence: { reviewRef: rv?.externalRef, decision: rv?.decision, moneyMoved: false },
        summary: ok
          ? `Billing team decision recorded: ${rv?.decision}. Refund processing, if any, happens in the provider's billing system — Orylo does not move money.`
          : "The decision could not be confirmed at the provider.",
      };
    },
  },

  "internal.create_reschedule_request": {
    internal: true,
    label: "Ask the scheduling team for a new appointment",
    schema: z
      .object({
        preferredWindows: z.array(z.string().min(3).max(80)).min(1).max(5),
        contactMethod: z.enum(["email", "phone"]),
      })
      .strict(),
    objectiveKey: "reschedule_requested",
    requiredRules: ["service.reschedule_allowed"],
    customerConsent: true,
    operatorOnly: false,
    consentText: () =>
      "I ask the scheduling team to contact me about a new appointment using the windows I gave.",
    async assess(rc) {
      if (rc.rules["service.reschedule_allowed"] !== true)
        throw denied("Policy does not allow reschedule requests.");
      return {};
    },
    async run(rc) {
      const r = await escalateCase(rc.tx, systemCtx(rc.orgId, "action-gateway"), rc.caseRow.id, {
        reason: `Reschedule request. Preferred: ${(rc.input.preferredWindows as string[]).join("; ")} (contact by ${rc.input.contactMethod})`,
        reasonCode: "RESCHEDULE_REQUEST",
        queueKey: "field-scheduling",
        recordOnly: true,
      });
      return {
        externalRef: `SCHED-${r.escalation.id.slice(0, 8).toUpperCase()}`,
        detail: { escalationId: r.escalation.id, externalSchedulingSystem: "not connected" },
        replayed: false,
      };
    },
    async verify(rc, r) {
      const id = (r.detail as { escalationId?: string }).escalationId;
      const ok = !!id;
      return {
        verified: ok,
        method: "read_after_write:internal_queue",
        evidence: {
          handoffRef: r.externalRef,
          queue: "field-scheduling",
          limit: "No external scheduling system is connected; the slot is confirmed by a person.",
        },
        summary: "The scheduling team has your request. A person will confirm a new slot.",
      };
    },
  },

  "internal.confirm_reschedule": {
    internal: true,
    label: "Record the confirmed new appointment",
    schema: z.object({ newSlot: z.string().min(5).max(120) }).strict(),
    objectiveKey: "new_appointment_confirmed",
    requiredRules: ["service.reschedule_allowed"],
    customerConsent: false,
    operatorOnly: true,
    consentText: () => "",
    async assess() {
      return {};
    },
    async run(rc) {
      const ev = await appendEvent(rc.tx, rc.ctx, rc.caseRow.id, {
        type: "appointment.confirmed",
        message: `New appointment confirmed: ${rc.input.newSlot}`,
        payload: { newSlot: rc.input.newSlot },
      });
      return {
        externalRef: `APPT-${ev.id.slice(0, 8).toUpperCase()}`,
        detail: { eventId: ev.id, newSlot: rc.input.newSlot, recordedBy: "operator" },
        replayed: false,
      };
    },
    async verify(rc, r) {
      const [ev] = await rc.tx
        .select({ id: caseEvents.id })
        .from(caseEvents)
        .where(
          and(
            eq(caseEvents.id, (r.detail as { eventId: string }).eventId),
            eq(caseEvents.organizationId, rc.orgId),
          ),
        );
      return {
        verified: !!ev,
        method: "operator_recorded:case_event",
        evidence: {
          newSlot: rc.input.newSlot,
          limit: "Human-confirmed; no external scheduling system was queried.",
        },
        summary: `Appointment confirmed by our team for ${rc.input.newSlot}.`,
      };
    },
  },

  "internal.assemble_claim_packet": {
    internal: true,
    label: "Assemble your warranty claim packet",
    schema: z
      .object({
        serialNumber: z.string().min(4).max(60),
        purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        issue: z.string().min(10).max(1000),
      })
      .strict(),
    objectiveKey: "claim_packet_ready",
    requiredRules: ["warranty.coverage_months"],
    customerConsent: true,
    operatorOnly: false,
    consentText: () =>
      "I confirm these details are accurate and ask for them to be assembled into a claim packet for the claims team.",
    async assess(rc) {
      const months = Number(rc.rules["warranty.coverage_months"]);
      const bought = new Date(String(rc.input.purchaseDate) + "T00:00:00Z");
      const expires = new Date(bought);
      expires.setUTCMonth(expires.getUTCMonth() + months);
      if (expires.getTime() < Date.now())
        throw denied(`The purchase is outside the ${months}-month warranty coverage window.`);
      const [n] = await rc.tx
        .select({ n: sql<number>`count(*)::int` })
        .from(caseEvidence)
        .where(and(eq(caseEvidence.caseId, rc.caseRow.id), eq(caseEvidence.organizationId, rc.orgId)));
      if ((n?.n ?? 0) < 1)
        throw new AppError(
          "VALIDATION",
          "Please upload proof of purchase before we can assemble the claim packet.",
        );
      return {};
    },
    async run(rc) {
      const ev = await appendEvent(rc.tx, rc.ctx, rc.caseRow.id, {
        type: "claim.packet",
        message: "Warranty claim packet assembled",
        payload: {
          serialNumber: rc.input.serialNumber,
          purchaseDate: rc.input.purchaseDate,
          issue: rc.input.issue,
        },
      });
      const h = await escalateCase(rc.tx, systemCtx(rc.orgId, "action-gateway"), rc.caseRow.id, {
        reason: "Warranty claim packet ready for review",
        reasonCode: "CLAIM_HANDOFF",
        queueKey: "claims-review",
        recordOnly: true,
      });
      return {
        externalRef: `CLAIMPKT-${ev.id.slice(0, 8).toUpperCase()}`,
        detail: { eventId: ev.id, handoffId: h.escalation.id, externalClaimsSystem: "not connected" },
        replayed: false,
      };
    },
    async verify(rc, r) {
      const [ev] = await rc.tx
        .select()
        .from(caseEvents)
        .where(
          and(
            eq(caseEvents.id, (r.detail as { eventId: string }).eventId),
            eq(caseEvents.organizationId, rc.orgId),
          ),
        );
      const p = (ev?.payload ?? {}) as Record<string, unknown>;
      const complete = !!(p.serialNumber && p.purchaseDate && p.issue);
      return {
        verified: complete,
        method: "read_after_write:claim_packet_completeness",
        evidence: {
          fieldsPresent: ["serialNumber", "purchaseDate", "issue"].filter((k) => p[k]),
          proofDocuments: "attached",
          limit: "Claim is NOT submitted to a manufacturer system; it is handed to the claims-review queue.",
        },
        summary:
          "Your claim packet is complete and with the claims team. It has not been submitted externally.",
      };
    },
  },
};

export const listOperations = () =>
  Object.entries(OPERATIONS).map(([name, o]) => ({
    name,
    label: o.label,
    operatorOnly: o.operatorOnly,
    customerConsent: o.customerConsent,
  }));

// ---------------------------------------------------------------- helpers
const actionTimeoutMs = () => Number(process.env.ACTION_TIMEOUT_MS ?? 5000);
const MAX_ATTEMPTS_FALLBACK = 3;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(
      () => rej(new AdapterError("ADAPTER_TIMEOUT", `Provider did not answer within ${ms}ms`, true)),
      ms,
    );
  });
  p.catch(() => undefined); // an abandoned call must never become an unhandled rejection
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** Proposal-time provider errors surface as typed domain errors. */
async function assessOrMap(op: OpDef, rc: RunCtx) {
  try {
    return await op.assess(rc);
  } catch (e) {
    if (e instanceof AdapterError)
      throw new AppError(
        e.code === "ADAPTER_DENIED"
          ? "ADAPTER_DENIED"
          : e.code === "ADAPTER_TIMEOUT"
            ? "ADAPTER_TIMEOUT"
            : "ADAPTER_FAILURE",
        e.message,
      );
    throw e;
  }
}

const extKeyFor = (orgId: string, requestId: string) => sha256Hex(`${orgId}:${requestId}`).slice(0, 32);

async function loadRequest(tx: DbOrTx, orgId: string, id: string, lock = false) {
  const q = tx
    .select()
    .from(actionRequests)
    .where(and(eq(actionRequests.id, id), eq(actionRequests.organizationId, orgId)));
  const [r] = lock ? await q.for("update") : await q;
  if (!r) throw notFound("Action request");
  return r;
}

async function effectiveApprovalThreshold(tx: DbOrTx, orgId: string, rules: RuleMap) {
  const [o] = await tx
    .select({ s: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const policy =
    typeof rules["billing.review_approval_threshold_cents"] === "number"
      ? (rules["billing.review_approval_threshold_cents"] as number)
      : Infinity;
  return Math.min(policy, o?.s.approvalThresholdCents ?? Infinity);
}

async function mkRunCtx(
  tx: DbOrTx,
  ctx: Ctx,
  caseRow: CaseRow,
  req: RunCtx["req"],
  input: Record<string, unknown>,
  rules: RuleMap,
): Promise<RunCtx> {
  return {
    tx,
    ctx,
    orgId: ctx.orgId,
    caseRow,
    req,
    input,
    provider: await getSubscriptionProvider(rootDb, ctx.orgId),
    extKey: extKeyFor(ctx.orgId, req.id),
    rules,
  };
}

function authorizeActor(ctx: Ctx, op: OpDef, caseRow: CaseRow, kind: "request" | "execute") {
  const a = ctx.actor;
  if (a.type === "operator") {
    requirePermission(a.role, "action.execute");
    if (op.customerConsent && kind === "execute") return; // consent itself is checked separately
    return;
  }
  if (op.operatorOnly) throw forbidden("This operation can only be performed by staff");
  if (a.type === "customer" || a.type === "channel") {
    if (a.customerId !== caseRow.customerId) throw notFound("Case");
    return;
  }
  // system: only the workflow engine, acting on a case that is already scoped
}

async function authority(tx: DbOrTx, orgId: string, op: OpDef) {
  const { rules, conflicts, sources } = await activeRules(tx, orgId);
  const blocked = op.requiredRules.filter((r) => !(r in rules));
  if (blocked.length) {
    const inConflict = blocked.filter((b) => conflicts.some((c) => c.key === b));
    throw denied(
      inConflict.length
        ? `Approved policies contradict each other on: ${inConflict.join(", ")}. A person must resolve this before any action is taken.`
        : `No approved policy authorises this action (missing: ${blocked.join(", ")}).`,
      { missingRules: blocked, conflicting: inConflict },
    );
  }
  return { rules, versionId: sources[op.requiredRules[0]] as string };
}

// ---------------------------------------------------------------- request
export interface RequestActionInput {
  caseId: string;
  operation: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
}

export async function requestAction(db: DbOrTx, ctx: Ctx, i: RequestActionInput) {
  const op = OPERATIONS[i.operation];
  if (!op) throw new AppError("UNSUPPORTED", `Unknown operation: ${i.operation}`);
  if (!/^[A-Za-z0-9_.:-]{8,120}$/.test(i.idempotencyKey))
    throw new AppError("VALIDATION", "idempotencyKey must be 8-120 URL-safe characters");
  const parsed = op.schema.safeParse(i.input);
  if (!parsed.success)
    throw new AppError(
      "VALIDATION",
      `Invalid input: ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`,
    );
  const input = parsed.data;
  try {
    return await db.transaction(async (tx) => {
      const caseRow = await lockCase(tx, ctx, i.caseId);
      assertCaseAccess(ctx, caseRow, ctx.actor.type === "operator");
      authorizeActor(ctx, op, caseRow, "request");
      const inputHash = sha256Hex(canonicalJson({ op: i.operation, caseId: caseRow.id, input }));

      // Idempotent replay: same key → same request (provided it is the SAME request).
      const [existing] = await tx
        .select()
        .from(actionRequests)
        .where(
          and(
            eq(actionRequests.organizationId, ctx.orgId),
            eq(actionRequests.idempotencyKey, i.idempotencyKey),
          ),
        );
      if (existing) {
        if (
          existing.caseId !== caseRow.id ||
          existing.operation !== i.operation ||
          sha256Hex(
            canonicalJson({ op: existing.operation, caseId: existing.caseId, input: existing.input }),
          ) !== inputHash
        )
          throw new AppError("CONFLICT", "This idempotency key was already used for a different request");
        await audit(tx, ctx, {
          action: "action.request.duplicate",
          targetType: "action_request",
          targetId: existing.id,
          metadata: { operation: i.operation },
        });
        return { request: existing, created: false as const };
      }

      if (!["READY_FOR_ACTION", "AWAITING_APPROVAL"].includes(caseRow.state))
        throw new AppError(
          "CONFLICT",
          `Case is ${caseRow.state}; it must be READY_FOR_ACTION before an action can be requested`,
          { state: caseRow.state },
        );

      const { rules, versionId } = await authority(tx, ctx.orgId, op);
      const req0 = {
        id: "00000000-0000-0000-0000-000000000000",
        caseId: caseRow.id,
        customerId: caseRow.customerId,
      };
      const rc = await mkRunCtx(tx, ctx, caseRow, req0, input, rules);
      const assessment = await assessOrMap(op, rc);

      const threshold = await effectiveApprovalThreshold(tx, ctx.orgId, rules);
      const needsApproval =
        op.objectiveKey === "billing_review_submitted" && (assessment.amountCents ?? 0) > threshold;
      const [row] = await tx
        .insert(actionRequests)
        .values({
          organizationId: ctx.orgId,
          caseId: caseRow.id,
          customerId: caseRow.customerId,
          operation: i.operation,
          input,
          idempotencyKey: i.idempotencyKey,
          status: op.customerConsent ? "AWAITING_CONSENT" : needsApproval ? "AWAITING_APPROVAL" : "APPROVED",
          requestedByType: ctx.actor.type,
          requestedById: ctx.actor.id,
          policyVersionId: versionId,
          expectedStateHash: assessment.stateHash,
          amountCents: assessment.amountCents,
        })
        .onConflictDoNothing({ target: [actionRequests.organizationId, actionRequests.idempotencyKey] })
        .returning();
      if (!row) {
        const [again] = await tx
          .select()
          .from(actionRequests)
          .where(
            and(
              eq(actionRequests.organizationId, ctx.orgId),
              eq(actionRequests.idempotencyKey, i.idempotencyKey),
            ),
          );
        if (!again || again.caseId !== caseRow.id || again.operation !== i.operation)
          throw new AppError("CONFLICT", "This idempotency key was already used for a different request");
        return { request: again, created: false as const };
      }
      await appendEvent(tx, ctx, caseRow.id, {
        type: "action.requested",
        message: op.customerConsent
          ? `Proposed: ${op.label}. Waiting for the customer's confirmation.`
          : `Requested: ${op.label}`,
        visibility: "customer",
        payload: { requestId: row.id, operation: i.operation },
      });
      await audit(tx, ctx, {
        action: "action.request",
        targetType: "action_request",
        targetId: row.id,
        metadata: { operation: i.operation, needsApproval },
      });
      if (op.customerConsent)
        await notifyCustomer(tx, {
          orgId: ctx.orgId,
          caseId: caseRow.id,
          customerId: caseRow.customerId,
          type: "consent_requested",
          title: `Please review a proposed fix (${caseRow.reference})`,
          body: op.label,
        });
      return { request: row, created: true as const };
    });
  } catch (e) {
    if (e instanceof AppError)
      await audit(rootDb, ctx, {
        action: "action.request",
        targetType: "case",
        targetId: i.caseId,
        outcome: "denied",
        metadata: { operation: i.operation, code: e.code, message: e.message },
      }).catch(() => undefined);
    throw mapDbError(e);
  }
}

// ---------------------------------------------------------------- consent & approval
export async function grantConsent(db: DbOrTx, ctx: Ctx, requestId: string, granted: boolean) {
  assertCanAct(ctx.actor);
  if (ctx.actor.type !== "customer" && ctx.actor.type !== "channel")
    throw forbidden("Only the customer can give or decline consent");
  const probe = await loadRequest(db, ctx.orgId, requestId);
  try {
    return await db.transaction(async (tx) => {
      const caseRow = await lockCase(tx, ctx, probe.caseId);
      assertCaseAccess(ctx, caseRow);
      const req = await loadRequest(tx, ctx.orgId, requestId, true);
      const op = OPERATIONS[req.operation];
      if (!op.customerConsent) throw new AppError("VALIDATION", "This action does not take customer consent");
      const [prior] = await tx
        .select()
        .from(actionApprovals)
        .where(
          and(
            eq(actionApprovals.actionRequestId, req.id),
            eq(actionApprovals.approverType, "customer"),
            eq(actionApprovals.organizationId, ctx.orgId),
          ),
        );
      if (prior) {
        // A recorded answer is final: "no" after "yes" must never run the action, and "yes" after "no" must not resurrect it.
        if ((prior.decision === "GRANTED") !== granted)
          throw new AppError(
            "CONFLICT",
            "You've already answered this step. To change your mind, ask for a person.",
          );
        return { request: req, decision: prior.decision, duplicate: true as const };
      }
      if (req.status !== "AWAITING_CONSENT")
        throw new AppError("CONFLICT", `Request is ${req.status}; consent can no longer be recorded`);

      const consentText = op.consentText(req.input);
      await tx.insert(actionApprovals).values({
        organizationId: ctx.orgId,
        actionRequestId: req.id,
        approverType: "customer",
        approverId: ctx.actor.id,
        decision: granted ? "GRANTED" : "DECLINED",
        consentText,
      });
      if (!granted) {
        const [u] = await tx
          .update(actionRequests)
          .set({
            status: "DENIED",
            failureCode: "CUSTOMER_DECLINED",
            failureMessage: "Customer declined",
            updatedAt: new Date(),
          })
          .where(eq(actionRequests.id, req.id))
          .returning();
        await appendEvent(tx, ctx, caseRow.id, {
          type: "action.declined",
          message: "You chose not to go ahead with this step. Nothing was changed.",
          payload: { requestId: req.id },
        });
        await audit(tx, ctx, {
          action: "action.consent",
          targetType: "action_request",
          targetId: req.id,
          metadata: { granted: false },
        });
        return { request: u, decision: "DECLINED", duplicate: false as const };
      }
      const { rules } = await authority(tx, ctx.orgId, op);
      const threshold = await effectiveApprovalThreshold(tx, ctx.orgId, rules);
      const needsApproval =
        op.objectiveKey === "billing_review_submitted" && (req.amountCents ?? 0) > threshold;
      const [u] = await tx
        .update(actionRequests)
        .set({ status: needsApproval ? "AWAITING_APPROVAL" : "APPROVED", updatedAt: new Date() })
        .where(eq(actionRequests.id, req.id))
        .returning();
      await appendEvent(tx, ctx, caseRow.id, {
        type: "action.consented",
        message: `You confirmed: ${op.label}`,
        payload: { requestId: req.id },
      });
      await audit(tx, ctx, {
        action: "action.consent",
        targetType: "action_request",
        targetId: req.id,
        metadata: { granted: true, needsApproval },
      });
      if (needsApproval && caseRow.state === "READY_FOR_ACTION")
        await transitionCase(tx, systemCtx(ctx.orgId, "action-gateway"), caseRow.id, {
          to: "AWAITING_APPROVAL",
          message: "This amount needs a team member's approval before we proceed.",
          payload: { requestId: req.id },
        });
      return { request: u, decision: "GRANTED", duplicate: false as const };
    });
  } catch (e) {
    throw mapDbError(e);
  }
}

export async function decideApproval(
  db: DbOrTx,
  ctx: Ctx,
  requestId: string,
  granted: boolean,
  reason?: string,
) {
  if (ctx.actor.type !== "operator") throw forbidden("Only staff can approve actions");
  requirePermission(ctx.actor.role, "approval.decide");
  const approverId = ctx.actor.id;
  const probe = await loadRequest(db, ctx.orgId, requestId);
  return db.transaction(async (tx) => {
    const caseRow = await lockCase(tx, ctx, probe.caseId);
    const req = await loadRequest(tx, ctx.orgId, requestId, true);
    if (req.status === "APPROVED" || req.status === "DENIED") {
      const [prior] = await tx
        .select()
        .from(actionApprovals)
        .where(
          and(eq(actionApprovals.actionRequestId, req.id), eq(actionApprovals.approverType, "operator")),
        );
      if (prior) return { request: req, decision: prior.decision, duplicate: true as const };
    }
    if (req.status !== "AWAITING_APPROVAL")
      throw new AppError("CONFLICT", `Request is ${req.status}; it is not waiting for approval`);
    if (req.requestedById === approverId && req.requestedByType === "operator")
      throw new AppError("FORBIDDEN", "Separation of duties: you cannot approve a request you made");
    await tx.insert(actionApprovals).values({
      organizationId: ctx.orgId,
      actionRequestId: req.id,
      approverType: "operator",
      approverId,
      decision: granted ? "GRANTED" : "DECLINED",
      reason,
    });
    const [u] = await tx
      .update(actionRequests)
      .set({
        status: granted ? "APPROVED" : "DENIED",
        failureCode: granted ? null : "APPROVAL_DENIED",
        failureMessage: granted ? null : (reason ?? "Approval denied"),
        updatedAt: new Date(),
      })
      .where(eq(actionRequests.id, req.id))
      .returning();
    await appendEvent(tx, ctx, caseRow.id, {
      type: granted ? "action.approved" : "action.approval_denied",
      message: granted
        ? "A team member approved this step."
        : `A team member declined this step${reason ? `: ${reason}` : ""}.`,
      payload: { requestId: req.id },
    });
    await audit(tx, ctx, {
      action: "action.approval",
      targetType: "action_request",
      targetId: req.id,
      metadata: { granted, reason },
    });
    if (!granted && caseRow.state === "AWAITING_APPROVAL")
      await transitionCase(tx, systemCtx(ctx.orgId, "action-gateway"), caseRow.id, {
        to: "READY_FOR_ACTION",
        message: "Approval was declined; the step will not run.",
      });
    // The customer already gave exact-wording consent; once a person approves, nobody should have to come back and
    // click again. A durable job runs the step (consent TTL, state hash and policy are re-checked at execution; if any
    // no longer holds the step simply waits for the customer, who still sees it as ready to confirm).
    if (granted)
      await enqueueJob(tx, {
        orgId: ctx.orgId,
        kind: "action.retry",
        payload: { requestId: req.id, caseId: caseRow.id },
        dedupeKey: `action-approved:${req.id}`,
        maxAttempts: 3,
      });
    return { request: u, decision: granted ? "GRANTED" : "DECLINED", duplicate: false as const };
  });
}

// ---------------------------------------------------------------- receipts
function receiptBody(r: {
  receiptNo: string;
  orgId: string;
  actionRequestId: string;
  operation: string;
  externalRef: string | null;
  result: unknown;
}) {
  return canonicalJson(r);
}
export async function verifyReceipt(db: DbOrTx, receiptNo: string) {
  const [r] = await db.select().from(actionReceipts).where(eq(actionReceipts.receiptNo, receiptNo));
  if (!r) return { valid: false as const, reason: "unknown receipt" };
  const expect = hmacHex(
    receiptBody({
      receiptNo: r.receiptNo,
      orgId: r.organizationId,
      actionRequestId: r.actionRequestId,
      operation: r.operation,
      externalRef: r.externalRef,
      result: r.result,
    }),
  );
  return safeEqualHex(expect, r.signature)
    ? {
        valid: true as const,
        receipt: {
          receiptNo: r.receiptNo,
          operation: r.operation,
          externalRef: r.externalRef,
          issuedAt: r.createdAt,
        },
      }
    : { valid: false as const, reason: "signature mismatch" };
}

// ---------------------------------------------------------------- execute
export type ExecutionStatus = "EXECUTED" | "DUPLICATE" | "FAILED";
export interface ExecutionResult {
  status: ExecutionStatus;
  request: ReqRow;
  receipt: typeof actionReceipts.$inferSelect | null;
  verification: { verified: boolean; summary: string; method: string } | null;
  failure?: { code: string; message: string; retriable: boolean };
  caseState: string;
}

export async function executeAction(db: DbOrTx, ctx: Ctx, requestId: string): Promise<ExecutionResult> {
  try {
    return await db.transaction((tx) => runExecute(tx, ctx, requestId));
  } catch (e) {
    const mapped = mapDbError(e);
    if (mapped instanceof AppError) await recordDenial(ctx, requestId, mapped);
    throw mapped;
  }
}

/** A denial rolls the transaction back (no state change). Record that it happened, outside it. */
async function recordDenial(ctx: Ctx, requestId: string, e: AppError) {
  try {
    const [req] = await rootDb
      .select()
      .from(actionRequests)
      .where(and(eq(actionRequests.id, requestId), eq(actionRequests.organizationId, ctx.orgId)));
    await audit(rootDb, ctx, {
      action: "action.execute",
      targetType: "action_request",
      targetId: requestId,
      outcome: "denied",
      metadata: { code: e.code, message: e.message },
    });
    if (!req || req.status === "SUCCEEDED") return;
    const terminal: ErrorCode[] = ["POLICY_DENIED", "POLICY_STALE", "STALE_STATE"];
    if (terminal.includes(e.code)) {
      await rootDb
        .update(actionRequests)
        .set({
          status: e.code === "POLICY_DENIED" ? "DENIED" : "FAILED",
          failureCode: e.code,
          failureMessage: e.message,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(actionRequests.id, requestId),
            inArray(actionRequests.status, ["AWAITING_CONSENT", "AWAITING_APPROVAL", "APPROVED", "FAILED"]),
          ),
        );
      await rootDb.transaction(async (tx) => {
        const row = await lockCase(tx, systemCtx(ctx.orgId), req.caseId);
        await appendEvent(tx, systemCtx(ctx.orgId, "action-gateway"), row.id, {
          type: "action.refused",
          // Customer-visible text is fixed and safe; the detailed reason (may name internal rule keys) stays in the payload.
          message:
            e.code === "STALE_STATE" || e.code === "POLICY_STALE"
              ? "Something changed after you confirmed, so nothing was done. We'll ask you to confirm again."
              : "We can't carry this out automatically. A person will look at it.",
          payload: { requestId, code: e.code, detail: e.message },
        });
      });
    }
  } catch {
    /* denial bookkeeping must never mask the original error */
  }
}

async function runExecute(tx: DbOrTx, ctx: Ctx, requestId: string): Promise<ExecutionResult> {
  signingKey(); // fail fast on a bad production key, before any provider side effect
  const probe = await loadRequest(tx, ctx.orgId, requestId);
  const op = OPERATIONS[probe.operation];
  if (!op) throw new AppError("UNSUPPORTED", "Unknown operation");
  const caseRow0 = await lockCase(tx, ctx, probe.caseId); // lock order: case → request
  assertCaseAccess(ctx, caseRow0, ctx.actor.type === "operator");
  authorizeActor(ctx, op, caseRow0, "execute");
  const req = await loadRequest(tx, ctx.orgId, requestId, true);
  const sys = systemCtx(ctx.orgId, "action-gateway");

  if (req.status === "SUCCEEDED") {
    const [receipt] = await tx
      .select()
      .from(actionReceipts)
      .where(eq(actionReceipts.actionRequestId, req.id));
    await audit(tx, ctx, {
      action: "action.duplicate",
      targetType: "action_request",
      targetId: req.id,
      metadata: { operation: req.operation },
    });
    return {
      status: "DUPLICATE",
      request: req,
      receipt: receipt ?? null,
      verification: null,
      caseState: caseRow0.state,
    };
  }
  if (req.status === "DENIED" || req.status === "CANCELLED")
    throw new AppError(
      "POLICY_DENIED",
      `This request was ${req.status.toLowerCase()} and cannot run (${req.failureCode ?? "no reason recorded"})`,
    );
  if (req.status === "FAILED" && req.failureCode && ["STALE_STATE", "POLICY_STALE"].includes(req.failureCode))
    throw new AppError(
      "STALE_STATE",
      "The situation changed after you confirmed. Please review and confirm again.",
    );

  // consent / approval
  const approvals = await tx
    .select()
    .from(actionApprovals)
    .where(and(eq(actionApprovals.actionRequestId, req.id), eq(actionApprovals.organizationId, ctx.orgId)));
  const consent = approvals.find((a) => a.approverType === "customer" && a.decision === "GRANTED");
  if (op.customerConsent && !consent)
    throw new AppError("CONSENT_REQUIRED", "The customer has not confirmed this step", { requestId: req.id });
  if (op.customerConsent && consent && Date.now() - consent.createdAt.getTime() > CONSENT_TTL_MS)
    throw new AppError(
      "CONSENT_REQUIRED",
      "Your confirmation has expired. Please review and confirm again.",
      { requestId: req.id },
    );
  const { rules } = await authority(tx, ctx.orgId, op);
  const threshold = await effectiveApprovalThreshold(tx, ctx.orgId, rules);
  if (
    op.objectiveKey === "billing_review_submitted" &&
    (req.amountCents ?? 0) > threshold &&
    !approvals.some((a) => a.approverType === "operator" && a.decision === "GRANTED")
  )
    throw new AppError("APPROVAL_REQUIRED", "A team member must approve this amount first", {
      requestId: req.id,
    });

  // policy currency: the version that authorised the request must still be the live one
  if (req.policyVersionId && !(await isVersionCurrent(tx, ctx.orgId, req.policyVersionId)))
    throw new AppError(
      "POLICY_STALE",
      "The policy that authorised this has since been replaced. It must be re-evaluated.",
    );

  // case must be in a state that permits starting
  let caseRow = caseRow0;
  if (caseRow.state !== "ACTION_PENDING") {
    const t = await transitionCase(tx, sys, caseRow.id, {
      to: "ACTION_PENDING",
      message: `Starting: ${op.label}`,
      payload: { requestId: req.id },
    });
    caseRow = t.case;
  }

  const rc = await mkRunCtx(tx, ctx, caseRow, req, req.input, rules);
  const [{ n: prevAttempts }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(actionAttempts)
    .where(eq(actionAttempts.actionRequestId, req.id));
  const attemptNo = prevAttempts + 1;
  await tx
    .update(actionRequests)
    .set({ status: "EXECUTING", updatedAt: new Date() })
    .where(eq(actionRequests.id, req.id));
  const [attempt] = await tx
    .insert(actionAttempts)
    .values({
      organizationId: ctx.orgId,
      actionRequestId: req.id,
      attemptNo,
      status: "STARTED",
      adapter: rc.provider.name,
      request: { operation: req.operation, externalKey: rc.extKey },
    })
    .returning();

  // current-state + policy-rule check. A provider outage here is a recorded failed attempt, not a crash.
  // Unknown outcome: if an earlier attempt TIMED OUT, the provider may already have applied it. If it recognises
  // our external key, skip the "is the state still as consented?" gate and let the idempotent call replay the result.
  let assessment: Assessment;
  try {
    const [timedOut] =
      prevAttempts > 0
        ? await tx
            .select({ id: actionAttempts.id })
            .from(actionAttempts)
            .where(and(eq(actionAttempts.actionRequestId, req.id), eq(actionAttempts.status, "TIMEOUT")))
        : [];
    const alreadyApplied = timedOut ? await rc.provider.hasOperation(ctx.orgId, rc.extKey) : false;
    assessment = alreadyApplied ? {} : await op.assess(rc);
  } catch (err) {
    if (err instanceof AdapterError)
      return handleFailure(tx, ctx, op, caseRow, req, attempt.id, attemptNo, err, rules);
    throw err;
  }
  if (req.expectedStateHash && assessment.stateHash && assessment.stateHash !== req.expectedStateHash)
    throw new AppError(
      "STALE_STATE",
      "The account changed after you confirmed, so nothing was done. Please review and confirm again.",
    );

  let result: MutationResult;
  try {
    result = op.internal
      ? await op.run(rc, assessment)
      : await withTimeout(op.run(rc, assessment), actionTimeoutMs());
  } catch (err) {
    return handleFailure(tx, ctx, op, caseRow, req, attempt.id, attemptNo, err, rules);
  }

  // ---- success of the CALL (not yet of the OUTCOME)
  const receiptNo = `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${sha256Hex(`${req.id}`).slice(0, 16).toUpperCase()}`;
  const safeResult = {
    summary: op.label,
    status: result.replayed ? "ALREADY_APPLIED" : "APPLIED",
    ...result.detail,
  };
  const signature = hmacHex(
    receiptBody({
      receiptNo,
      orgId: ctx.orgId,
      actionRequestId: req.id,
      operation: req.operation,
      externalRef: result.externalRef,
      result: safeResult,
    }),
  );
  await tx
    .update(actionAttempts)
    .set({
      status: "SUCCEEDED",
      response: safeResult,
      externalRef: result.externalRef,
      finishedAt: new Date(),
    })
    .where(eq(actionAttempts.id, attempt.id));
  const [receipt] = await tx
    .insert(actionReceipts)
    .values({
      organizationId: ctx.orgId,
      actionRequestId: req.id,
      receiptNo,
      operation: req.operation,
      externalRef: result.externalRef,
      result: safeResult,
      signature,
    })
    .returning();
  const [doneReq] = await tx
    .update(actionRequests)
    .set({ status: "SUCCEEDED", failureCode: null, failureMessage: null, updatedAt: new Date() })
    .where(eq(actionRequests.id, req.id))
    .returning();
  await setObjective(
    tx,
    sys,
    caseRow.id,
    op.objectiveKey,
    "COMPLETED",
    "Action executed; awaiting independent verification",
  );
  await transitionCase(tx, sys, caseRow.id, {
    to: "ACTION_EXECUTED",
    message: `${op.label}: done. Checking the result…`,
    payload: { requestId: req.id, receiptNo },
  });
  await transitionCase(tx, sys, caseRow.id, {
    to: "OUTCOME_PENDING_VERIFICATION",
    message: "Verifying the outcome against the source system.",
  });
  await tx
    .insert(usageRecords)
    .values({
      organizationId: ctx.orgId,
      metric: "action_executed",
      caseId: caseRow.id,
      dedupeKey: `action:${req.id}`,
    })
    .onConflictDoNothing();

  // ---- independent verification (read-after-write); success of the call is NOT success of the outcome
  const v = await op.verify(rc, result);
  const consentRef =
    approvals.find((a) => a.approverType === "customer")?.id ??
    approvals.find((a) => a.approverType === "operator")?.id;
  const objectives = await getObjectives(tx, ctx.orgId, caseRow.id);
  await setObjective(tx, sys, caseRow.id, op.objectiveKey, v.verified ? "VERIFIED" : "COMPLETED", v.summary);
  const remaining = objectives
    .filter(
      (o) => o.required && o.key !== op.objectiveKey && !["VERIFIED", "NOT_APPLICABLE"].includes(o.status),
    )
    .map((o) => o.key);
  await appendLedger(tx, ctx, {
    caseId: caseRow.id,
    objectiveKey: op.objectiveKey,
    requestedOutcome: op.label,
    actionAttempted: req.operation,
    executor: `gateway:${ctx.actor.type}:${ctx.actor.id}`,
    authorizationRef: consentRef ? `approval:${consentRef}` : `actor:${ctx.actor.id}`,
    policyVersionId: req.policyVersionId,
    externalOperationRef: result.externalRef,
    executionResult: "SUCCEEDED",
    verificationMethod: v.method,
    verifiedAt: v.verified ? new Date() : undefined,
    evidence: { ...v.evidence, summary: v.summary, receiptNo, replayedByProvider: result.replayed },
    finalOutcome: v.verified ? "VERIFIED" : "UNVERIFIED",
    remainingObjectives: remaining,
  });

  if (v.verified) {
    await tx
      .insert(usageRecords)
      .values({
        organizationId: ctx.orgId,
        metric: "verified_outcome",
        caseId: caseRow.id,
        dedupeKey: `outcome:${caseRow.id}:${op.objectiveKey}`,
      })
      .onConflictDoNothing();
    await notifyCustomer(tx, {
      orgId: ctx.orgId,
      caseId: caseRow.id,
      customerId: caseRow.customerId,
      type: "action_completed",
      title: `${op.label}: confirmed`,
      body: v.summary,
    });
    await settleCaseAfterVerification(tx, sys, caseRow.id, remaining);
  } else {
    await appendEvent(tx, sys, caseRow.id, {
      type: "verification.failed",
      message: `The action ran but we could not confirm the result. We will not tell you it worked. (${v.summary})`,
      payload: { requestId: req.id },
    });
    await escalateCase(tx, sys, caseRow.id, {
      reason: `Action ${req.operation} executed but outcome could not be verified: ${v.summary}`,
      reasonCode: "VERIFICATION_FAILED",
    });
    await notifyRoles(tx, {
      orgId: ctx.orgId,
      caseId: caseRow.id,
      roles: ["operator"],
      type: "action_failed",
      title: `Unverified outcome on ${caseRow.reference}`,
      body: v.summary,
    });
  }
  const [after] = await tx
    .select({ s: resolutionCases.state })
    .from(resolutionCases)
    .where(eq(resolutionCases.id, caseRow.id));
  await audit(tx, ctx, {
    action: "action.execute",
    targetType: "action_request",
    targetId: req.id,
    metadata: { operation: req.operation, verified: v.verified, receiptNo, attemptNo },
  });
  return {
    status: "EXECUTED",
    request: doneReq,
    receipt,
    verification: { verified: v.verified, summary: v.summary, method: v.method },
    caseState: after.s,
  };
}

/** After a verified objective: resolve, go back to ready (more to do), or wait on an external party. */
async function settleCaseAfterVerification(tx: DbOrTx, sys: Ctx, caseId: string, remaining: string[]) {
  if (remaining.length === 0) {
    await transitionCase(tx, sys, caseId, {
      to: "VERIFIED_RESOLVED",
      type: "case.verified_resolved",
      message: "Every objective has been independently verified.",
      payload: { verified: true },
    });
    return;
  }
  const open = await tx
    .select({ id: actionRequests.id })
    .from(actionRequests)
    .where(
      and(
        eq(actionRequests.caseId, caseId),
        eq(actionRequests.organizationId, sys.orgId),
        inArray(actionRequests.status, ["AWAITING_CONSENT", "AWAITING_APPROVAL", "APPROVED", "REQUESTED"]),
      ),
    );
  if (open.length)
    await transitionCase(tx, sys, caseId, {
      to: "READY_FOR_ACTION",
      message: "One step is verified. Another is ready for your confirmation.",
    });
  // else: remains OUTCOME_PENDING_VERIFICATION — waiting on an external/human decision. This is partial resolution, not success.
}

async function handleFailure(
  tx: DbOrTx,
  ctx: Ctx,
  op: OpDef,
  caseRow: CaseRow,
  req: ReqRow,
  attemptId: string,
  attemptNo: number,
  err: unknown,
  rules: RuleMap,
): Promise<ExecutionResult> {
  const sys = systemCtx(ctx.orgId, "action-gateway");
  const ae =
    err instanceof AdapterError
      ? err
      : new AdapterError(
          "ADAPTER_FAILURE",
          err instanceof Error ? err.message : "Unknown adapter error",
          true,
        );
  const status = ae.code === "ADAPTER_TIMEOUT" ? "TIMEOUT" : "FAILED";
  await tx
    .update(actionAttempts)
    .set({ status, errorCode: ae.code, response: { error: ae.message }, finishedAt: new Date() })
    .where(eq(actionAttempts.id, attemptId));
  const [failedReq] = await tx
    .update(actionRequests)
    .set({ status: "FAILED", failureCode: ae.code, failureMessage: ae.message, updatedAt: new Date() })
    .where(eq(actionRequests.id, req.id))
    .returning();
  await appendLedger(tx, ctx, {
    caseId: caseRow.id,
    objectiveKey: op.objectiveKey,
    requestedOutcome: op.label,
    actionAttempted: req.operation,
    executor: `gateway:${ctx.actor.type}:${ctx.actor.id}`,
    policyVersionId: req.policyVersionId,
    executionResult: "FAILED",
    evidence: {
      errorCode: ae.code,
      message: ae.message,
      attemptNo,
      summary: `The attempt failed (${ae.code}). Nothing is confirmed.`,
    },
    finalOutcome: "FAILED",
    remainingObjectives: [op.objectiveKey],
  });
  await appendEvent(tx, sys, caseRow.id, {
    type: "action.failed",
    message: `We could not complete "${op.label}" (${ae.code}). Nothing has been reported as done.`,
    payload: { requestId: req.id, attemptNo, retriable: ae.retriable },
  });
  const max =
    typeof rules["escalation.max_failed_attempts"] === "number"
      ? (rules["escalation.max_failed_attempts"] as number)
      : MAX_ATTEMPTS_FALLBACK;
  const exhausted = attemptNo >= max;
  if (ae.retriable && !exhausted) {
    // The provider MAY have applied it (timeout): a retry reuses the same external key, so it replays instead of repeating.
    await tx.update(actionRequests).set({ status: "APPROVED" }).where(eq(actionRequests.id, req.id));
    await transitionCase(tx, sys, caseRow.id, {
      to: "READY_FOR_ACTION",
      message: "Temporary problem — safe to retry.",
    });
    // Nobody has to remember to retry: a durable job re-runs it with backoff (same external key → replay, never repeat).
    await enqueueJob(tx, {
      orgId: ctx.orgId,
      kind: "action.retry",
      payload: { requestId: req.id },
      runAt: new Date(Date.now() + backoffMs(attemptNo)),
      dedupeKey: `action-retry:${req.id}:${attemptNo}`,
      maxAttempts: 3,
    });
  } else if (ae.code === "STALE_STATE") {
    await transitionCase(tx, sys, caseRow.id, {
      to: "READY_FOR_ACTION",
      message: "The situation changed; please review and confirm again.",
    });
  } else {
    await transitionCase(tx, sys, caseRow.id, {
      to: "BLOCKED",
      message: "We couldn't complete this automatically.",
      payload: { code: ae.code },
    });
    await escalateCase(tx, sys, caseRow.id, {
      reason: `Action ${req.operation} failed (${ae.code}): ${ae.message}. Attempts: ${attemptNo}.`,
      reasonCode: ae.code === "ADAPTER_DENIED" ? "AUTHORIZATION_DENIED" : "ACTION_FAILED",
    });
  }
  await notifyRoles(tx, {
    orgId: ctx.orgId,
    caseId: caseRow.id,
    roles: ["operator"],
    type: "action_failed",
    title: `Action failed on ${caseRow.reference}`,
    body: ae.message,
  });
  await audit(tx, ctx, {
    action: "action.execute",
    targetType: "action_request",
    targetId: req.id,
    outcome: "error",
    metadata: { code: ae.code, attemptNo },
  });
  const [after] = await tx
    .select({ s: resolutionCases.state })
    .from(resolutionCases)
    .where(eq(resolutionCases.id, caseRow.id));
  return {
    status: "FAILED",
    request: failedReq,
    receipt: null,
    verification: null,
    failure: { code: ae.code, message: ae.message, retriable: ae.retriable && !exhausted },
    caseState: after.s,
  };
}

// ---------------------------------------------------------------- convenience & queries
export interface SubmitInput extends RequestActionInput {
  consent?: boolean; // customer/channel: grant (true) or decline (false) in the same call
}

/** Customer/channel confirms (or declines) an existing proposed action and, if confirmed, runs it. Safe to call concurrently. */
export async function confirmAction(db: DbOrTx, ctx: Ctx, requestId: string, consent = true) {
  const c = await grantConsent(db, ctx, requestId, consent);
  if (c.decision === "DECLINED")
    return {
      status: "DECLINED" as const,
      request: c.request,
      receipt: null,
      verification: null,
      failure: undefined,
      caseState: undefined as string | undefined,
    };
  return runAndSummarize(db, ctx, requestId);
}

async function runAndSummarize(db: DbOrTx, ctx: Ctx, requestId: string) {
  try {
    const r = await executeAction(db, ctx, requestId);
    return {
      status: r.status as ExecutionStatus | "AWAITING_APPROVAL" | "AWAITING_CONSENT",
      request: r.request,
      receipt: r.receipt,
      verification: r.verification,
      failure: r.failure,
      caseState: r.caseState as string | undefined,
    };
  } catch (e) {
    if (e instanceof AppError && (e.code === "APPROVAL_REQUIRED" || e.code === "CONSENT_REQUIRED")) {
      const [cur] = await db.select().from(actionRequests).where(eq(actionRequests.id, requestId));
      return {
        status: (e.code === "APPROVAL_REQUIRED" ? "AWAITING_APPROVAL" : "AWAITING_CONSENT") as
          ExecutionStatus | "AWAITING_APPROVAL" | "AWAITING_CONSENT",
        request: cur,
        receipt: null,
        verification: null,
        failure: undefined,
        caseState: undefined as string | undefined,
      };
    }
    throw e;
  }
}

export interface SubmitInput extends RequestActionInput {
  consent?: boolean; // customer/channel: grant (true) or decline (false) in the same call
}

/** One-call path used by operator tools and the eGain action API. Safe to call concurrently with the same key. */
export async function submitAction(db: DbOrTx, ctx: Ctx, i: SubmitInput) {
  const { request } = await requestAction(db, ctx, i);
  if (i.consent !== undefined && (ctx.actor.type === "customer" || ctx.actor.type === "channel"))
    return confirmAction(db, ctx, request.id, i.consent);
  return runAndSummarize(db, ctx, request.id);
}

export async function actionsForCase(db: DbOrTx, ctx: Ctx, caseId: string) {
  const customerView = !!actorCustomerId(ctx.actor);
  const reqs = await db
    .select()
    .from(actionRequests)
    .where(and(eq(actionRequests.caseId, caseId), eq(actionRequests.organizationId, ctx.orgId)))
    .orderBy(asc(actionRequests.createdAt));
  if (!reqs.length) return [];
  const ids = reqs.map((r) => r.id);
  const approvals = await db
    .select()
    .from(actionApprovals)
    .where(and(eq(actionApprovals.organizationId, ctx.orgId), inArray(actionApprovals.actionRequestId, ids)));
  const receipts = await db
    .select()
    .from(actionReceipts)
    .where(and(eq(actionReceipts.organizationId, ctx.orgId), inArray(actionReceipts.actionRequestId, ids)));
  const attempts = await db
    .select()
    .from(actionAttempts)
    .where(and(eq(actionAttempts.organizationId, ctx.orgId), inArray(actionAttempts.actionRequestId, ids)))
    .orderBy(desc(actionAttempts.attemptNo));
  return reqs.map((r) => {
    const op = OPERATIONS[r.operation];
    const receipt = receipts.find((x) => x.actionRequestId === r.id);
    const base = {
      id: r.id,
      operation: r.operation,
      label: op?.label ?? r.operation,
      status: r.status,
      consentText: op?.customerConsent ? op.consentText(r.input) : null,
      needsApproval: r.status === "AWAITING_APPROVAL",
      amountCents: r.amountCents,
      failureMessage: r.failureMessage,
      createdAt: r.createdAt,
      receipt: receipt
        ? {
            receiptNo: receipt.receiptNo,
            summary: (receipt.result as { summary?: string }).summary,
            issuedAt: receipt.createdAt,
          }
        : null,
    };
    if (customerView) return base;
    return {
      ...base,
      failureCode: r.failureCode,
      requestedBy: `${r.requestedByType}:${r.requestedById}`,
      input: r.input,
      approvals: approvals
        .filter((a) => a.actionRequestId === r.id)
        .map((a) => ({ type: a.approverType, decision: a.decision, reason: a.reason, at: a.createdAt })),
      attempts: attempts
        .filter((a) => a.actionRequestId === r.id)
        .map((a) => ({
          no: a.attemptNo,
          status: a.status,
          errorCode: a.errorCode,
          externalRef: a.externalRef,
        })),
      externalRef: receipt?.externalRef ?? null,
    };
  });
}

/** Customers listing used by diagnosis flows. */
export async function customerEmailFor(db: DbOrTx, orgId: string, customerId: string) {
  const [c] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, orgId)));
  return c?.email;
}
