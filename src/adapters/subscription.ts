/**
 * Subscription-provider adapter contract + the DEMO implementation.
 *
 * The demo implementation talks to the synthetic `sim_*` tables through its own pooled connections
 * (never the caller's transaction), so the Action Gateway sees it as a genuinely separate system:
 * it can be read independently after a write, it enforces its own idempotency and versioning, and it
 * can be told to misbehave. NOTHING here moves money. A "billing review" is a request for a human
 * reviewer; only a (simulated) human decision can mark it decided.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db as rootDb, type DbOrTx } from "@/db";
import {
  integrationConnections,
  simAccounts,
  simBillingReviews,
  simCancellationRequests,
  simCharges,
  simOperations,
} from "@/db/schema";
import { canonicalJson, sha256Hex } from "@/domain/crypto";

export type SimMode = "normal" | "failure" | "delay" | "duplicate" | "stale_state" | "auth_denied";
export const SIM_MODES: SimMode[] = ["normal", "failure", "delay", "duplicate", "stale_state", "auth_denied"];

export class AdapterError extends Error {
  constructor(
    public readonly code: "ADAPTER_FAILURE" | "ADAPTER_TIMEOUT" | "ADAPTER_DENIED" | "STALE_STATE" | "NOT_FOUND",
    message: string,
    public readonly retriable: boolean,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export interface AccountState {
  accountId: string;
  accountNumber: string;
  customerId: string;
  planName: string;
  priceCents: number;
  status: "ACTIVE" | "CANCELLED";
  billingActive: boolean;
  nextBillingAt: Date | null;
  cancelledAt: Date | null;
  version: number;
}
export interface CancellationRequest {
  id: string;
  requestedAt: Date;
  channel: string;
  status: string;
  note: string | null;
}
export interface Charge {
  id: string;
  amountCents: number;
  description: string;
  chargedAt: Date;
  status: string;
}
export interface BillingReview {
  id: string;
  chargeId: string;
  externalRef: string;
  status: string;
  decision: string | null;
}
export type MutationResult = {
  externalRef: string;
  detail: Record<string, unknown>;
  /** true when the provider recognised the external key and replayed the original result. */
  replayed: boolean;
};

export interface SubscriptionProvider {
  readonly name: string;
  readAccount(orgId: string, accountNumber: string): Promise<AccountState | null>;
  listAccounts(orgId: string, customerId: string): Promise<AccountState[]>;
  /** Has the provider already processed this external idempotency key? Used to resolve unknown outcomes after a timeout. */
  hasOperation(orgId: string, externalKey: string): Promise<boolean>;
  readCancellationRequests(orgId: string, accountId: string): Promise<CancellationRequest[]>;
  readCharges(orgId: string, accountId: string): Promise<Charge[]>;
  readBillingReview(orgId: string, chargeId: string): Promise<BillingReview | null>;
  correctCancellation(a: { orgId: string; accountId: string; expectedVersion: number; externalKey: string; effectiveAt: Date }): Promise<MutationResult>;
  createBillingReview(a: { orgId: string; accountId: string; chargeId: string; externalKey: string }): Promise<MutationResult>;
  /** Simulates the provider's human billing team deciding a review. Operator-only in Orylo. */
  recordReviewDecision(a: { orgId: string; chargeId: string; decision: "APPROVED_FOR_REFUND_PROCESSING" | "DENIED"; externalKey: string }): Promise<MutationResult>;
}

/** Hash of the fields that matter for consent: if they change after consent, the consent is stale. */
export const accountStateHash = (a: AccountState) =>
  sha256Hex(canonicalJson({ id: a.accountId, status: a.status, billingActive: a.billingActive, version: a.version }));

export async function getSimConfig(db: DbOrTx, orgId: string): Promise<{ mode: SimMode; delayMs: number }> {
  const [c] = await db
    .select({ config: integrationConnections.config })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.organizationId, orgId), eq(integrationConnections.provider, "demo_subscription")));
  const cfg = (c?.config ?? {}) as { mode?: SimMode; delayMs?: number };
  return { mode: SIM_MODES.includes(cfg.mode as SimMode) ? (cfg.mode as SimMode) : "normal", delayMs: cfg.delayMs ?? 400 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoSubscriptionAdapter implements SubscriptionProvider {
  readonly name = "demo_subscription";
  constructor(
    private readonly mode: SimMode = "normal",
    private readonly delayMs = 400,
    private readonly db = rootDb,
  ) {}

  async readAccount(orgId: string, accountNumber: string): Promise<AccountState | null> {
    if (this.mode === "auth_denied") throw new AdapterError("ADAPTER_DENIED", "Provider rejected our credentials (403)", false);
    const [a] = await this.db
      .select()
      .from(simAccounts)
      .where(and(eq(simAccounts.organizationId, orgId), eq(simAccounts.accountNumber, accountNumber)));
    return a ? this.toState(a) : null;
  }

  async hasOperation(orgId: string, externalKey: string): Promise<boolean> {
    if (this.mode === "auth_denied") throw new AdapterError("ADAPTER_DENIED", "Provider rejected our credentials (403)", false);
    const [op] = await this.db.select({ id: simOperations.id }).from(simOperations).where(and(eq(simOperations.organizationId, orgId), eq(simOperations.externalKey, externalKey)));
    return !!op;
  }

  async listAccounts(orgId: string, customerId: string): Promise<AccountState[]> {
    if (this.mode === "auth_denied") throw new AdapterError("ADAPTER_DENIED", "Provider rejected our credentials (403)", false);
    const rows = await this.db
      .select()
      .from(simAccounts)
      .where(and(eq(simAccounts.organizationId, orgId), eq(simAccounts.customerId, customerId)));
    return rows.map((r) => this.toState(r));
  }

  private toState(a: typeof simAccounts.$inferSelect): AccountState {
    return {
      accountId: a.id,
      accountNumber: a.accountNumber,
      customerId: a.customerId,
      planName: a.planName,
      priceCents: a.priceCents,
      status: a.status as AccountState["status"],
      billingActive: a.billingActive,
      nextBillingAt: a.nextBillingAt,
      cancelledAt: a.cancelledAt,
      version: a.version,
    };
  }

  async readCancellationRequests(orgId: string, accountId: string) {
    if (this.mode === "auth_denied") throw new AdapterError("ADAPTER_DENIED", "Provider rejected our credentials (403)", false);
    return this.db
      .select()
      .from(simCancellationRequests)
      .where(and(eq(simCancellationRequests.organizationId, orgId), eq(simCancellationRequests.accountId, accountId)))
      .orderBy(desc(simCancellationRequests.requestedAt));
  }

  async readCharges(orgId: string, accountId: string) {
    if (this.mode === "auth_denied") throw new AdapterError("ADAPTER_DENIED", "Provider rejected our credentials (403)", false);
    return this.db
      .select()
      .from(simCharges)
      .where(and(eq(simCharges.organizationId, orgId), eq(simCharges.accountId, accountId)))
      .orderBy(desc(simCharges.chargedAt));
  }

  async readBillingReview(orgId: string, chargeId: string) {
    const [r] = await this.db
      .select()
      .from(simBillingReviews)
      .where(and(eq(simBillingReviews.organizationId, orgId), eq(simBillingReviews.chargeId, chargeId)));
    return r ?? null;
  }

  private gate() {
    if (this.mode === "failure") throw new AdapterError("ADAPTER_FAILURE", "Provider returned 503 Service Unavailable", true);
    if (this.mode === "auth_denied") throw new AdapterError("ADAPTER_DENIED", "Provider rejected our credentials (403)", false);
  }

  /** Run `fn` once, or twice in duplicate mode (at-least-once delivery), then optionally stall (delay mode). */
  private async deliver<T>(fn: () => Promise<T>): Promise<T> {
    this.gate();
    const first = await fn();
    if (this.mode === "duplicate") await fn(); // provider-side idempotency must absorb this
    if (this.mode === "delay") await sleep(this.delayMs); // mutation is COMMITTED; the response is slow
    return first;
  }

  async correctCancellation(a: Parameters<SubscriptionProvider["correctCancellation"]>[0]) {
    return this.deliver(() =>
      this.db.transaction(async (tx) => {
        const prior = await replay(tx, a.orgId, a.externalKey);
        if (prior) return prior;
        const [acct] = await tx
          .select()
          .from(simAccounts)
          .where(and(eq(simAccounts.id, a.accountId), eq(simAccounts.organizationId, a.orgId)))
          .for("update");
        if (!acct) throw new AdapterError("NOT_FOUND", "Account not found", false);
        // stale_state mode: another system changed the account after the caller read it.
        if (this.mode === "stale_state" && acct.version === a.expectedVersion) {
          await tx.update(simAccounts).set({ version: acct.version + 1 }).where(eq(simAccounts.id, acct.id));
          throw new AdapterError("STALE_STATE", "Account changed since it was read (version mismatch)", false);
        }
        if (acct.version !== a.expectedVersion) throw new AdapterError("STALE_STATE", `Account changed since it was read (version ${acct.version} ≠ ${a.expectedVersion})`, false);
        if (acct.status === "CANCELLED") throw new AdapterError("STALE_STATE", "Account is already cancelled", false);
        await tx
          .update(simAccounts)
          .set({ status: "CANCELLED", billingActive: false, cancelledAt: a.effectiveAt, nextBillingAt: null, version: acct.version + 1 })
          .where(eq(simAccounts.id, acct.id));
        await tx
          .update(simCancellationRequests)
          .set({ status: "PROCESSED" })
          .where(and(eq(simCancellationRequests.accountId, acct.id), eq(simCancellationRequests.organizationId, a.orgId), eq(simCancellationRequests.status, "FAILED_TO_APPLY")));
        const externalRef = `SUB-OP-${a.externalKey.slice(0, 8).toUpperCase()}`;
        const result: MutationResult = { externalRef, detail: { accountNumber: acct.accountNumber, newStatus: "CANCELLED", billingActive: false, version: acct.version + 1 }, replayed: false };
        await tx.insert(simOperations).values({ organizationId: a.orgId, externalKey: a.externalKey, operation: "correct_cancellation", result });
        return result;
      }),
    );
  }

  async createBillingReview(a: Parameters<SubscriptionProvider["createBillingReview"]>[0]) {
    return this.deliver(() =>
      this.db.transaction(async (tx) => {
        const prior = await replay(tx, a.orgId, a.externalKey);
        if (prior) return prior;
        const [ch] = await tx
          .select()
          .from(simCharges)
          .where(and(eq(simCharges.id, a.chargeId), eq(simCharges.organizationId, a.orgId), eq(simCharges.accountId, a.accountId)))
          .for("update");
        if (!ch) throw new AdapterError("NOT_FOUND", "Charge not found on this account", false);
        const [existing] = await tx.select().from(simBillingReviews).where(eq(simBillingReviews.chargeId, ch.id));
        if (existing) {
          const r: MutationResult = { externalRef: existing.externalRef, detail: { reviewStatus: existing.status, chargeId: ch.id, note: "A review already existed for this charge" }, replayed: true };
          await tx.insert(simOperations).values({ organizationId: a.orgId, externalKey: a.externalKey, operation: "create_billing_review", result: r });
          return r;
        }
        const externalRef = `BR-${a.externalKey.slice(0, 8).toUpperCase()}`;
        await tx.insert(simBillingReviews).values({ organizationId: a.orgId, accountId: a.accountId, chargeId: ch.id, externalRef });
        await tx.update(simCharges).set({ status: "UNDER_REVIEW" }).where(eq(simCharges.id, ch.id));
        const result: MutationResult = { externalRef, detail: { reviewStatus: "OPEN", chargeId: ch.id, amountCents: ch.amountCents, moneyMoved: false }, replayed: false };
        await tx.insert(simOperations).values({ organizationId: a.orgId, externalKey: a.externalKey, operation: "create_billing_review", result });
        return result;
      }),
    );
  }

  async recordReviewDecision(a: Parameters<SubscriptionProvider["recordReviewDecision"]>[0]) {
    return this.deliver(() =>
      this.db.transaction(async (tx) => {
        const prior = await replay(tx, a.orgId, a.externalKey);
        if (prior) return prior;
        const [rv] = await tx
          .select()
          .from(simBillingReviews)
          .where(and(eq(simBillingReviews.chargeId, a.chargeId), eq(simBillingReviews.organizationId, a.orgId)))
          .for("update");
        if (!rv) throw new AdapterError("NOT_FOUND", "No billing review for this charge", false);
        if (rv.status === "DECIDED") throw new AdapterError("STALE_STATE", "Review already decided", false);
        await tx.update(simBillingReviews).set({ status: "DECIDED", decision: a.decision, decidedAt: new Date() }).where(eq(simBillingReviews.id, rv.id));
        const result: MutationResult = { externalRef: rv.externalRef, detail: { reviewStatus: "DECIDED", decision: a.decision, moneyMoved: false, note: "Orylo records the decision only; refund processing happens in the provider's billing system." }, replayed: false };
        await tx.insert(simOperations).values({ organizationId: a.orgId, externalKey: a.externalKey, operation: "record_review_decision", result });
        return result;
      }),
    );
  }
}

async function replay(tx: DbOrTx, orgId: string, key: string): Promise<MutationResult | null> {
  const [op] = await tx
    .update(simOperations)
    .set({ deliveries: sql`${simOperations.deliveries} + 1` })
    .where(and(eq(simOperations.organizationId, orgId), eq(simOperations.externalKey, key)))
    .returning();
  return op ? { ...(op.result as unknown as MutationResult), replayed: true } : null;
}

export async function getSubscriptionProvider(db: DbOrTx, orgId: string): Promise<SubscriptionProvider> {
  const { mode, delayMs } = await getSimConfig(db, orgId);
  return new DemoSubscriptionAdapter(mode, delayMs);
}
