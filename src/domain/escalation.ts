import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  actionAttempts,
  actionRequests,
  caseEvents,
  escalations,
  queues,
  resolutionCases,
  workflowStepExecutions,
  workflowExecutions,
} from "@/db/schema";
import type { DbOrTx } from "@/db";
import { AppError, forbidden, notFound } from "./errors";
import { actorCustomerId, type Ctx } from "./context";
import { appendEvent, assertCaseAccess, getObjectives, lockCase, transitionCase } from "./cases";
import { requirePermission } from "./rbac";
import { audit } from "./audit";
import { notifyCustomer, notifyRoles, notifyUser } from "./notifications";

/** Everything a human needs so the customer never has to start over. Frozen at escalation time. */
export async function buildContextSnapshot(tx: DbOrTx, orgId: string, caseId: string) {
  // Sequential on purpose: a transaction owns ONE connection and must not run concurrent queries.
  const objectives = await getObjectives(tx, orgId, caseId);
  const events = await tx
    .select()
    .from(caseEvents)
    .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.organizationId, orgId)))
    .orderBy(desc(caseEvents.seq))
    .limit(15);
  const reqs = await tx
    .select()
    .from(actionRequests)
    .where(and(eq(actionRequests.caseId, caseId), eq(actionRequests.organizationId, orgId)))
    .orderBy(asc(actionRequests.createdAt));
  const steps = await tx
    .select({
      nodeId: workflowStepExecutions.nodeId,
      nodeType: workflowStepExecutions.nodeType,
      status: workflowStepExecutions.status,
      error: workflowStepExecutions.error,
    })
    .from(workflowStepExecutions)
    .innerJoin(workflowExecutions, eq(workflowExecutions.id, workflowStepExecutions.executionId))
    .where(and(eq(workflowExecutions.caseId, caseId), eq(workflowStepExecutions.organizationId, orgId)))
    .orderBy(asc(workflowStepExecutions.startedAt));
  const attempts = reqs.length
    ? await tx
        .select({
          requestId: actionAttempts.actionRequestId,
          no: actionAttempts.attemptNo,
          status: actionAttempts.status,
          errorCode: actionAttempts.errorCode,
        })
        .from(actionAttempts)
        .where(
          and(
            eq(actionAttempts.organizationId, orgId),
            inArray(
              actionAttempts.actionRequestId,
              reqs.map((r) => r.id),
            ),
          ),
        )
    : [];
  return {
    capturedAt: new Date().toISOString(),
    objectives: objectives.map((o) => ({ key: o.key, label: o.label, status: o.status, detail: o.detail })),
    actions: reqs.map((r) => ({
      id: r.id,
      operation: r.operation,
      status: r.status,
      failureCode: r.failureCode,
      attempts: attempts.filter((a) => a.requestId === r.id),
    })),
    failedSteps: steps
      .filter((s) => s.status === "FAILED")
      .map((s) => ({ nodeId: s.nodeId, error: s.error })),
    recentEvents: events
      .reverse()
      .map((e) => ({ seq: e.seq, type: e.type, message: e.message, at: e.createdAt })),
  };
}

export interface EscalateInput {
  reason: string;
  reasonCode: string;
  queueKey?: string;
  channel?: "queue" | "callback_request" | "email_request";
  /** When true only record the handoff; do not move the case (used for workflow hand-offs). */
  recordOnly?: boolean;
}

async function queueId(tx: DbOrTx, orgId: string, key?: string) {
  const [q] = await tx
    .select({ id: queues.id })
    .from(queues)
    .where(and(eq(queues.organizationId, orgId), eq(queues.key, key ?? "escalations")));
  return q?.id ?? null;
}

/** Create a real escalation record (status + queue + owner) and move the case to ESCALATED. */
export async function escalateCase(db: DbOrTx, ctx: Ctx, caseIdOrRef: string, input: EscalateInput) {
  if (!input.reason.trim()) throw new AppError("VALIDATION", "A reason is required");
  return db.transaction(async (tx) => {
    const row = await lockCase(tx, ctx, caseIdOrRef);
    assertCaseAccess(ctx, row, ctx.actor.type === "operator");
    const [open] = await tx
      .select()
      .from(escalations)
      .where(
        and(
          eq(escalations.caseId, row.id),
          eq(escalations.organizationId, ctx.orgId),
          inArray(escalations.status, ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"]),
          eq(escalations.channel, input.channel ?? "queue"),
        ),
      );
    if (open && !input.recordOnly) return { escalation: open, created: false as const };
    const qid = await queueId(tx, ctx.orgId, input.queueKey);
    const snapshot = await buildContextSnapshot(tx, ctx.orgId, row.id);
    const [esc] = await tx
      .insert(escalations)
      .values({
        organizationId: ctx.orgId,
        caseId: row.id,
        reason: input.reason.slice(0, 1000),
        reasonCode: input.reasonCode,
        queueId: qid,
        channel: input.channel ?? "queue",
        contextSnapshot: snapshot,
        createdByType: ctx.actor.type,
        createdById: ctx.actor.id,
      })
      .returning();
    if (!input.recordOnly) {
      if (row.state !== "ESCALATED") {
        await transitionCase(tx, ctx, row.id, {
          to: "ESCALATED",
          type: "case.escalated",
          message: `Passed to a person: ${input.reason.slice(0, 300)}`,
          payload: { escalationId: esc.id, reasonCode: input.reasonCode, channel: input.channel ?? "queue" },
        });
      }
      await tx
        .update(resolutionCases)
        .set({ queueId: qid ?? row.queueId })
        .where(and(eq(resolutionCases.id, row.id), eq(resolutionCases.organizationId, ctx.orgId)));
    } else {
      await appendEvent(tx, ctx, row.id, {
        type: "case.handoff",
        message: `Handed to ${input.queueKey ?? "queue"}: ${input.reason.slice(0, 300)}`,
        payload: { escalationId: esc.id },
      });
    }
    await audit(tx, ctx, {
      action: "escalation.create",
      targetType: "escalation",
      targetId: esc.id,
      metadata: { reasonCode: input.reasonCode, channel: input.channel ?? "queue", caseId: row.id },
    });
    await notifyRoles(tx, {
      orgId: ctx.orgId,
      caseId: row.id,
      roles: ["operator", "admin"],
      type: "escalation_updated",
      title: `Escalation: ${row.reference}`,
      body: input.reason.slice(0, 200),
    });
    await notifyCustomer(tx, {
      orgId: ctx.orgId,
      caseId: row.id,
      customerId: row.customerId,
      type: "escalation_updated",
      title: `A person is now looking at ${row.reference}`,
      body: "Everything we know about your case has been passed on, so you won't need to repeat yourself.",
    });
    return { escalation: esc, created: true as const };
  });
}

export async function takeOwnership(db: DbOrTx, ctx: Ctx, escalationId: string) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "escalation.manage");
  const actorId = ctx.actor.id;
  return db.transaction(async (tx) => {
    const [e] = await tx
      .select()
      .from(escalations)
      .where(and(eq(escalations.id, escalationId), eq(escalations.organizationId, ctx.orgId)))
      .for("update");
    if (!e) throw notFound("Escalation");
    if (e.ownerUserId && e.ownerUserId !== actorId)
      throw new AppError("CONFLICT", "Someone else already owns this escalation");
    const [u] = await tx
      .update(escalations)
      .set({ ownerUserId: actorId, status: "IN_PROGRESS", updatedAt: new Date() })
      .where(eq(escalations.id, e.id))
      .returning();
    await tx
      .update(resolutionCases)
      .set({ assigneeUserId: actorId, updatedAt: new Date() })
      .where(and(eq(resolutionCases.id, e.caseId), eq(resolutionCases.organizationId, ctx.orgId)));
    const row = await lockCase(tx, ctx, e.caseId);
    await appendEvent(tx, ctx, e.caseId, {
      type: "escalation.owned",
      message: "A team member has taken ownership of your case.",
      payload: { escalationId: e.id },
    });
    await audit(tx, ctx, { action: "escalation.take", targetType: "escalation", targetId: e.id });
    await notifyCustomer(tx, {
      orgId: ctx.orgId,
      caseId: e.caseId,
      customerId: row.customerId,
      type: "escalation_updated",
      title: `${row.reference} has a human owner`,
      body: "A team member is working on your case.",
    });
    return u;
  });
}

/** Resolve the escalation; optionally hand control back to the automated workflow. */
export async function resolveEscalation(
  db: DbOrTx,
  ctx: Ctx,
  escalationId: string,
  note: string,
  returnToAutomation = false,
) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "escalation.manage");
  return db.transaction(async (tx) => {
    const [e] = await tx
      .select()
      .from(escalations)
      .where(and(eq(escalations.id, escalationId), eq(escalations.organizationId, ctx.orgId)))
      .for("update");
    if (!e) throw notFound("Escalation");
    if (e.status === "RESOLVED" || e.status === "RETURNED_TO_AUTOMATION") return e;
    const [u] = await tx
      .update(escalations)
      .set({
        status: returnToAutomation ? "RETURNED_TO_AUTOMATION" : "RESOLVED",
        resolutionNote: note.slice(0, 2000),
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(escalations.id, e.id))
      .returning();
    const row = await lockCase(tx, ctx, e.caseId);
    if (returnToAutomation && row.state === "ESCALATED")
      await transitionCase(tx, ctx, row.id, {
        to: "INVESTIGATING",
        type: "case.returned_to_automation",
        message: "Returned to automated handling after human review.",
        payload: { escalationId: e.id },
      });
    else
      await appendEvent(tx, ctx, row.id, {
        type: "escalation.resolved",
        message: `Escalation closed: ${note.slice(0, 300)}`,
        payload: { escalationId: e.id },
      });
    await audit(tx, ctx, {
      action: "escalation.resolve",
      targetType: "escalation",
      targetId: e.id,
      metadata: { returnToAutomation },
    });
    if (row.assigneeUserId)
      await notifyUser(tx, {
        orgId: ctx.orgId,
        caseId: row.id,
        userId: row.assigneeUserId,
        type: "escalation_updated",
        title: `Escalation closed: ${row.reference}`,
      });
    await notifyCustomer(tx, {
      orgId: ctx.orgId,
      caseId: row.id,
      customerId: row.customerId,
      type: "escalation_updated",
      title: `Update on ${row.reference}`,
      body: note.slice(0, 200),
    });
    return u;
  });
}

/** Customer-safe view: status and who/where, never internal notes or the raw context snapshot. */
export async function escalationsForCase(db: DbOrTx, ctx: Ctx, caseId: string) {
  const rows = await db
    .select({ e: escalations, queueName: queues.name })
    .from(escalations)
    .leftJoin(queues, eq(queues.id, escalations.queueId))
    .where(and(eq(escalations.caseId, caseId), eq(escalations.organizationId, ctx.orgId)))
    .orderBy(desc(escalations.createdAt));
  if (actorCustomerId(ctx.actor))
    return rows.map(({ e, queueName }) => ({
      id: e.id,
      status: e.status,
      channel: e.channel,
      queue: queueName,
      createdAt: e.createdAt,
      hasOwner: !!e.ownerUserId,
      resolvedAt: e.resolvedAt,
    }));
  return rows.map(({ e, queueName }) => ({ ...e, queue: queueName, hasOwner: !!e.ownerUserId }));
}
