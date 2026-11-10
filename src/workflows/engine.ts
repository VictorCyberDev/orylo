/**
 * Workflow engine: a durable, resumable interpreter for versioned WorkflowSpecs.
 * Every node run is persisted (workflow_step_executions); waiting nodes simply stop the loop and are
 * resumed by `advance()` when the awaited thing happens (customer info, consent→action→verification).
 * It orchestrates; it never decides what is *allowed* — that is always the Action Gateway + policy rules.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  caseEvidence,
  workflowDefinitions,
  workflowExecutions,
  workflowStepExecutions,
  workflowVersions,
  resolutionCases,
} from "@/db/schema";
import type { DbOrTx } from "@/db";
import { db as rootDb } from "@/db";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { actorCustomerId, assertCanAct, systemCtx, type Ctx } from "@/domain/context";
import {
  assertCaseAccess,
  createCase,
  getObjectives,
  lockCase,
  setObjective,
  transitionCase,
  appendEvent,
} from "@/domain/cases";
import { requestAction } from "@/domain/actions";
import { escalateCase } from "@/domain/escalation";
import { AdapterError, getSubscriptionProvider, type SubscriptionProvider } from "@/adapters/subscription";
import {
  WorkflowSpecSchema,
  evalCondition,
  getPath,
  type Field,
  type WorkflowNode,
  type WorkflowSpec,
} from "./spec";
import { count } from "drizzle-orm";

type ExecCtx = {
  accountNumber?: string;
  answers: Record<string, unknown>;
  findings?: Record<string, unknown>;
  retries: Record<string, number>;
  waitingSince: Record<string, string>;
  pending?: string[];
};
const DAY_MS = 86_400_000;

export async function getPublishedSpec(db: DbOrTx, orgId: string, workflowKey: string) {
  const [row] = await db
    .select({ v: workflowVersions, d: workflowDefinitions })
    .from(workflowVersions)
    .innerJoin(workflowDefinitions, eq(workflowDefinitions.id, workflowVersions.definitionId))
    .where(
      and(
        eq(workflowVersions.organizationId, orgId),
        eq(workflowDefinitions.key, workflowKey),
        eq(workflowVersions.status, "PUBLISHED"),
      ),
    );
  if (!row) throw notFound(`Published workflow ${workflowKey}`);
  return { versionId: row.v.id, spec: WorkflowSpecSchema.parse(row.v.spec) };
}

export interface OpenWorkflowCaseInput {
  workflowKey: string;
  customerId: string;
  title: string;
  description?: string;
  source?: "portal" | "egain" | "operator";
  accountNumber?: string;
  priority?: "low" | "normal" | "high" | "urgent";
}

/** Create the case (with the workflow's objectives), start the execution, and run until the first wait. */
export async function openWorkflowCase(db: DbOrTx, ctx: Ctx, i: OpenWorkflowCaseInput) {
  const { versionId, spec } = await getPublishedSpec(db, ctx.orgId, i.workflowKey);
  const row = await createCase(db, ctx, {
    customerId: i.customerId,
    title: i.title,
    description: i.description,
    category: spec.category,
    source: i.source,
    priority: i.priority,
    workflowVersionId: versionId,
    objectives: spec.objectives,
  });
  await db.insert(workflowExecutions).values({
    organizationId: ctx.orgId,
    caseId: row.id,
    workflowVersionId: versionId,
    status: "RUNNING",
    currentNode: spec.start,
    context: { accountNumber: i.accountNumber, answers: {}, retries: {}, waitingSince: {} } satisfies ExecCtx,
  });
  await advance(db, systemCtx(ctx.orgId, "workflow-engine"), row.id);
  const [fresh] = await db
    .select()
    .from(resolutionCases)
    .where(and(eq(resolutionCases.id, row.id), eq(resolutionCases.organizationId, ctx.orgId)));
  return fresh;
}

async function diagnose(
  provider: SubscriptionProvider,
  orgId: string,
  customerId: string,
  accountNumber?: string,
) {
  let acctNo = accountNumber;
  if (!acctNo) acctNo = (await provider.listAccounts(orgId, customerId))[0]?.accountNumber;
  const acct = acctNo ? await provider.readAccount(orgId, acctNo) : null;
  // Another customer's account is indistinguishable from a missing one.
  if (!acct || acct.customerId !== customerId) return { accountFound: false } as Record<string, unknown>;
  const [reqs, charges] = await Promise.all([
    provider.readCancellationRequests(orgId, acct.accountId),
    provider.readCharges(orgId, acct.accountId),
  ]);
  const prior = reqs.filter((r) => r.status !== "PROCESSED")[0];
  const since = prior?.requestedAt ?? acct.cancelledAt ?? null;
  // With a known cancellation request/date: the first charge after it. Otherwise the latest posted charge (a candidate only).
  const disputed = since
    ? charges.find((c) => c.status === "POSTED" && c.chargedAt.getTime() > since.getTime())
    : charges.find((c) => c.status === "POSTED");
  const underReview = charges.some((c) => c.status === "UNDER_REVIEW");
  return {
    accountFound: true,
    accountNumber: acct.accountNumber,
    planName: acct.planName,
    accountStatus: acct.status,
    accountStillActive: acct.status === "ACTIVE",
    billingActive: acct.billingActive,
    priorCancellationFound: !!prior,
    priorCancellationAt: prior?.requestedAt.toISOString() ?? null,
    priorCancellationChannel: prior?.channel ?? null,
    daysSinceCancellationRequest: prior
      ? Math.floor((Date.now() - prior.requestedAt.getTime()) / DAY_MS)
      : null,
    disputedCharge: disputed
      ? {
          id: disputed.id,
          amountCents: disputed.amountCents,
          chargedAt: disputed.chargedAt.toISOString(),
          description: disputed.description,
        }
      : null,
    chargesChecked: charges.length,
    alreadyUnderReview: underReview,
  } as Record<string, unknown>;
}

function resolveInputs(map: Record<string, string>, context: unknown) {
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, v.startsWith("$.") ? getPath(context, v) : v]),
  );
}

function fieldSchema(f: Field): z.ZodType {
  switch (f.type) {
    case "text":
      return z.string().trim().min(1).max(1000);
    case "date":
      return z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((d) => !Number.isNaN(Date.parse(d)), "invalid date");
    case "text_list":
      return z.preprocess(
        (v) =>
          typeof v === "string"
            ? v
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)
            : v,
        z.array(z.string().min(3).max(80)).min(1).max(5),
      );
    case "choice":
      return z.enum((f.options ?? []) as [string, ...string[]]);
    case "evidence":
      return z.any();
  }
}

async function recordStep(
  tx: DbOrTx,
  orgId: string,
  executionId: string,
  node: WorkflowNode,
  status: string,
  output: Record<string, unknown> = {},
  error?: string,
) {
  await tx.insert(workflowStepExecutions).values({
    organizationId: orgId,
    executionId,
    nodeId: node.id,
    nodeType: node.type,
    status,
    output,
    error,
    finishedAt: status === "WAITING" ? null : new Date(),
  });
}

/** Run the execution forward until it waits or ends. Idempotent: safe to call at any time. */
export async function advance(db: DbOrTx, ctx: Ctx, caseIdOrRef: string) {
  const sys = systemCtx(ctx.orgId, "workflow-engine");
  return db.transaction(async (tx) => {
    const caseRow = await lockCase(tx, sys, caseIdOrRef);
    assertCaseAccess(ctx, caseRow); // the CALLER must be allowed to see this case, not just the engine
    const [exec] = await tx
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.caseId, caseRow.id),
          eq(workflowExecutions.organizationId, ctx.orgId),
          inArray(workflowExecutions.status, ["RUNNING", "WAITING"]),
        ),
      )
      .for("update");
    if (!exec) return { status: "NO_EXECUTION" as const };
    const [ver] = await tx
      .select()
      .from(workflowVersions)
      .where(
        and(eq(workflowVersions.id, exec.workflowVersionId), eq(workflowVersions.organizationId, ctx.orgId)),
      );
    const spec = WorkflowSpecSchema.parse(ver.spec);
    const wctx = exec.context as unknown as ExecCtx;
    let current = exec.currentNode ?? spec.start;
    let status: "RUNNING" | "WAITING" | "COMPLETED" = "RUNNING";

    for (let steps = 0; steps < 40; steps++) {
      const node = spec.nodes.find((n) => n.id === current);
      if (!node) throw new AppError("CONFLICT", `Workflow node ${current} no longer exists`);
      // Terminal case states stop the workflow (customer cancelled, etc.)
      const [live] = await tx
        .select({ s: resolutionCases.state })
        .from(resolutionCases)
        .where(eq(resolutionCases.id, caseRow.id));
      if (["CANCELLED", "FAILED"].includes(live.s)) {
        status = "COMPLETED";
        break;
      }

      const r = await runNode(tx, sys, spec, node, exec.id, caseRow.id, caseRow.customerId, wctx);
      if (r.kind === "wait") {
        if (!wctx.waitingSince[node.id]) {
          wctx.waitingSince[node.id] = new Date().toISOString();
          await recordStep(tx, ctx.orgId, exec.id, node, "WAITING", { reason: r.reason });
        }
        status = "WAITING";
        current = node.id;
        break;
      }
      delete wctx.waitingSince[node.id];
      await recordStep(
        tx,
        ctx.orgId,
        exec.id,
        node,
        r.kind === "failed" ? "FAILED" : "COMPLETED",
        r.output,
        r.kind === "failed" ? r.error : undefined,
      );
      if (r.kind === "end") {
        status = "COMPLETED";
        current = node.id;
        break;
      }
      current = r.next;
    }
    await tx
      .update(workflowExecutions)
      .set({
        currentNode: current,
        context: wctx as unknown as Record<string, unknown>,
        status,
        completedAt: status === "COMPLETED" ? new Date() : null,
        version: exec.version + 1,
      })
      .where(eq(workflowExecutions.id, exec.id));
    return { status, currentNode: current };
  });
}

type NodeResult =
  | { kind: "next"; next: string; output?: Record<string, unknown> }
  | { kind: "wait"; reason: string }
  | { kind: "end"; output?: Record<string, unknown> }
  | { kind: "failed"; next: string; error: string; output?: Record<string, unknown> };

async function runNode(
  tx: DbOrTx,
  sys: Ctx,
  spec: WorkflowSpec,
  node: WorkflowNode,
  executionId: string,
  caseId: string,
  customerId: string,
  w: ExecCtx,
): Promise<NodeResult> {
  const orgId = sys.orgId;
  switch (node.type) {
    case "lookup": {
      try {
        const provider = await getSubscriptionProvider(rootDb, orgId);
        const f = await diagnose(provider, orgId, customerId, w.accountNumber);
        w.findings = f;
        if (f.accountNumber) w.accountNumber = f.accountNumber as string;
        await transitionCase(tx, sys, caseId, {
          to: "INVESTIGATING",
          message: "Checking your account and earlier requests…",
        }).catch((e) => {
          if (!(e instanceof AppError && e.code === "ILLEGAL_TRANSITION")) throw e;
        });
        await appendEvent(tx, sys, caseId, {
          type: "diagnosis.completed",
          message: f.accountFound
            ? "We checked your account, your earlier requests and recent charges."
            : "We could not find a matching account.",
          payload: { findings: f },
        });
        return { kind: "next", next: node.next, output: { findings: f } };
      } catch (e) {
        if (!(e instanceof AdapterError)) throw e;
        const n = (w.retries[node.id] = (w.retries[node.id] ?? 0) + 1);
        const max = node.retry?.maxAttempts ?? 1;
        await recordStep(tx, orgId, executionId, node, "FAILED", { attempt: n }, e.message);
        if (e.retriable && n < max)
          return { kind: "wait", reason: `provider error, retry ${n}/${max}: ${e.message}` };
        return {
          kind: "failed",
          next: node.onError ?? spec.nodes.find((x) => x.type === "escalate")?.id ?? node.next,
          error: e.message,
        };
      }
    }
    case "decision": {
      const view = { ...w, answers: w.answers, findings: w.findings };
      const hit = node.branches.find((b) => b.when.every((c) => evalCondition(c, view)));
      return {
        kind: "next",
        next: hit ? hit.next : node.default,
        output: { matched: hit ? hit.next : "default" },
      };
    }
    case "collect_info": {
      const missing: string[] = [];
      for (const f of node.fields) {
        if (!f.required) continue;
        if (f.type === "evidence") {
          const [{ n }] = await tx
            .select({ n: count() })
            .from(caseEvidence)
            .where(and(eq(caseEvidence.caseId, caseId), eq(caseEvidence.organizationId, orgId)));
          if (n < 1) missing.push(f.key);
        } else if (w.answers[f.key] === undefined || w.answers[f.key] === "") missing.push(f.key);
      }
      if (missing.length) {
        w.pending = missing;
        await transitionCase(tx, sys, caseId, {
          to: "AWAITING_CUSTOMER_INFORMATION",
          message: "We need a few details from you to continue.",
          payload: { missing },
        }).catch((e) => {
          if (!(e instanceof AppError && e.code === "ILLEGAL_TRANSITION")) throw e;
        });
        return { kind: "wait", reason: `waiting for: ${missing.join(", ")}` };
      }
      w.pending = [];
      for (const f of node.fields)
        if (f.type === "date" && w.answers[f.key])
          w.answers[`${f.key}IsPast`] =
            new Date(String(w.answers[f.key]) + "T23:59:59Z").getTime() < Date.now();
      await transitionCase(tx, sys, caseId, {
        to: "INVESTIGATING",
        message: "Thanks — we have what we need.",
      }).catch((e) => {
        if (!(e instanceof AppError && e.code === "ILLEGAL_TRANSITION")) throw e;
      });
      return { kind: "next", next: node.next };
    }
    case "set_objective":
      await setObjective(tx, sys, caseId, node.objectiveKey, node.status, node.detail);
      return { kind: "next", next: node.next };
    case "propose_actions": {
      await transitionCase(tx, sys, caseId, {
        to: "READY_FOR_ACTION",
        message: "We know what we can do. Review and confirm below.",
      }).catch((e) => {
        if (!(e instanceof AppError && e.code === "ILLEGAL_TRANSITION")) throw e;
      });
      const proposed: string[] = [];
      for (const a of node.actions) {
        try {
          const r = await requestAction(tx, sys, {
            caseId,
            operation: a.operation,
            input: resolveInputs(a.input, w),
            idempotencyKey: `wf:${executionId}:${node.id}:${a.operation}`,
          });
          proposed.push(r.request.id);
        } catch (e) {
          if (!(e instanceof AppError)) throw e;
          // No authority / refused / invalid: safe default is a person, never a guess.
          await escalateCase(tx, sys, caseId, {
            reason: `Could not safely propose ${a.operation}: ${e.message}`,
            reasonCode: e.code,
          });
          return {
            kind: "failed",
            next: spec.nodes.find((x) => x.type === "end" && x.outcome === "HANDED_OFF")?.id ?? node.next,
            error: e.message,
            output: { code: e.code },
          };
        }
      }
      return { kind: "next", next: node.next, output: { proposed } };
    }
    case "await_objectives": {
      const objs = await getObjectives(tx, orgId, caseId);
      const watched = objs.filter((o) => node.objectives.includes(o.key));
      if (watched.every((o) => ["VERIFIED", "NOT_APPLICABLE"].includes(o.status)))
        return {
          kind: "next",
          next: node.next,
          output: { objectives: watched.map((o) => ({ key: o.key, status: o.status })) },
        };
      const since = w.waitingSince[node.id];
      if (
        node.timeoutHours &&
        node.onTimeout &&
        since &&
        Date.now() - Date.parse(since) > node.timeoutHours * 3_600_000
      )
        return { kind: "next", next: node.onTimeout, output: { timedOut: true } };
      return {
        kind: "wait",
        reason: `waiting for verified: ${watched
          .filter((o) => !["VERIFIED", "NOT_APPLICABLE"].includes(o.status))
          .map((o) => o.key)
          .join(", ")}`,
      };
    }
    case "escalate": {
      await escalateCase(tx, sys, caseId, {
        reason: node.reason,
        reasonCode: node.reasonCode,
        queueKey: node.queueKey,
      });
      return node.next ? { kind: "next", next: node.next } : { kind: "end" };
    }
    case "end":
      return { kind: "end", output: { outcome: node.outcome } };
  }
}

/** Customer (or channel/operator) supplies the details a collect_info node is waiting for. */
export async function provideInfo(
  db: DbOrTx,
  ctx: Ctx,
  caseIdOrRef: string,
  answers: Record<string, unknown>,
) {
  assertCanAct(ctx.actor);
  const a = ctx.actor;
  if (a.type === "operator") {
    if (a.role === "analyst") throw forbidden();
  }
  const result = await db.transaction(async (tx) => {
    const caseRow = await lockCase(tx, ctx, caseIdOrRef);
    assertCaseAccess(ctx, caseRow, a.type === "operator");
    const [exec] = await tx
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.caseId, caseRow.id),
          eq(workflowExecutions.organizationId, ctx.orgId),
          inArray(workflowExecutions.status, ["RUNNING", "WAITING"]),
        ),
      )
      .for("update");
    if (!exec) throw new AppError("CONFLICT", "This case is not waiting for information");
    const [ver] = await tx
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, exec.workflowVersionId));
    const spec = WorkflowSpecSchema.parse(ver.spec);
    const node = spec.nodes.find((n) => n.id === exec.currentNode);
    if (!node || node.type !== "collect_info")
      throw new AppError("CONFLICT", "This case is not waiting for information");
    const w = exec.context as unknown as ExecCtx;
    const errors: Record<string, string> = {};
    for (const f of node.fields) {
      if (f.type === "evidence" || answers[f.key] === undefined) continue;
      const p = fieldSchema(f).safeParse(answers[f.key]);
      if (p.success) w.answers[f.key] = p.data;
      else errors[f.key] = `${f.label}: please check this value`;
    }
    if (Object.keys(errors).length)
      throw new AppError("VALIDATION", Object.values(errors).join("; "), { fields: errors });
    await tx
      .update(workflowExecutions)
      .set({ context: w as unknown as Record<string, unknown> })
      .where(eq(workflowExecutions.id, exec.id));
    await appendEvent(tx, ctx, caseRow.id, {
      type: "info.provided",
      message: "You provided the requested details.",
      payload: { keys: node.fields.map((f) => f.key).filter((k) => answers[k] !== undefined) },
    });
    return caseRow.id;
  });
  await advance(db, ctx, result);
  return result;
}

export async function sweepTimeouts(db: DbOrTx, orgId: string) {
  const waiting = await db
    .select({ caseId: workflowExecutions.caseId })
    .from(workflowExecutions)
    .where(and(eq(workflowExecutions.organizationId, orgId), eq(workflowExecutions.status, "WAITING")));
  for (const w of waiting) await advance(db, systemCtx(orgId, "workflow-sweeper"), w.caseId);
  return { checked: waiting.length };
}

export async function executionView(db: DbOrTx, ctx: Ctx, caseId: string) {
  const [exec] = await db
    .select()
    .from(workflowExecutions)
    .where(and(eq(workflowExecutions.caseId, caseId), eq(workflowExecutions.organizationId, ctx.orgId)))
    .orderBy(desc(workflowExecutions.startedAt))
    .limit(1);
  if (!exec) return null;
  const [ver] = await db
    .select({ spec: workflowVersions.spec, version: workflowVersions.version })
    .from(workflowVersions)
    .where(eq(workflowVersions.id, exec.workflowVersionId));
  const spec = WorkflowSpecSchema.parse(ver.spec);
  const steps = await db
    .select()
    .from(workflowStepExecutions)
    .where(
      and(
        eq(workflowStepExecutions.executionId, exec.id),
        eq(workflowStepExecutions.organizationId, ctx.orgId),
      ),
    )
    .orderBy(workflowStepExecutions.startedAt);
  const w = exec.context as unknown as ExecCtx;
  const customer = !!actorCustomerId(ctx.actor);
  return {
    status: exec.status,
    currentNode: exec.currentNode,
    workflow: { key: spec.key, name: spec.name, version: ver.version },
    pendingFields: w.pending ?? [],
    collectFields: (() => {
      const n = spec.nodes.find((x) => x.id === exec.currentNode);
      return n?.type === "collect_info" ? n.fields : [];
    })(),
    findings: w.findings ?? null,
    steps: steps.map((s) => ({
      nodeId: s.nodeId,
      nodeType: s.nodeType,
      label: spec.nodes.find((n) => n.id === s.nodeId)?.label ?? s.nodeId,
      status: s.status,
      error: customer ? undefined : s.error,
      at: s.finishedAt ?? s.startedAt,
    })),
    ...(customer ? {} : { answers: w.answers, retries: w.retries }),
  };
}
