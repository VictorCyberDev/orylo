/**
 * Customer privacy rights.
 *  - Export: instant, customer-initiated, only the customer's own data in customer-safe form.
 *  - Erasure: a customer REQUESTS it; staff with `privacy.manage` process it (audited). It refuses while cases are open.
 *    What is erased: login account + sessions, profile (anonymized), uploaded files, notifications, access links, case
 *    titles/descriptions, and personal content inside case history (via the controlled redaction path).
 *    What is deliberately RETAINED (append-only integrity records): the shape of the case history (ids, order, states,
 *    timestamps), the outcome ledger and the audit log. They hold provider/account identifiers but no name or email.
 *    Provider-side (simulated) account records are outside Orylo's control.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  authRateLimits,
  caseEvents,
  caseEvidence,
  customerAccessGrants,
  customers,
  dataRequests,
  notifications,
  resolutionCases,
  users,
} from "@/db/schema";
import type { DbOrTx } from "@/db";
import { AppError, forbidden, notFound } from "./errors";
import { actorCustomerId, assertCanAct, type Ctx } from "./context";
import { requirePermission } from "./rbac";
import { audit } from "./audit";
import { notifyRoles } from "./notifications";
import { getCaseView } from "./case-view";
import { isTerminal } from "./case-machine";

void authRateLimits;

export async function exportMyData(db: DbOrTx, ctx: Ctx) {
  assertCanAct(ctx.actor);
  const cid = actorCustomerId(ctx.actor);
  if (!cid) throw forbidden();
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, cid), eq(customers.organizationId, ctx.orgId)));
  if (!c) throw notFound("Customer");
  const cases = await db
    .select({ id: resolutionCases.id })
    .from(resolutionCases)
    .where(and(eq(resolutionCases.customerId, cid), eq(resolutionCases.organizationId, ctx.orgId)));
  const views = [];
  for (const r of cases) views.push(await getCaseView(db, ctx, r.id));
  const notes = await db
    .select({
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.recipientCustomerId, cid), eq(notifications.organizationId, ctx.orgId)));
  await audit(db, ctx, { action: "privacy.export", targetType: "customer", targetId: cid });
  return {
    exportedAt: new Date().toISOString(),
    profile: { name: c.name, email: c.email, reference: c.externalRef, preferences: c.preferences },
    cases: views.map((v) => ({
      case: v.case,
      objectives: v.objectives,
      history: v.events,
      actions: v.actions,
      outcomes: v.ledger,
      escalations: v.escalations,
      evidence: v.evidence.map((e) => ({
        filename: e.filename,
        contentType: e.contentType,
        sizeBytes: e.sizeBytes,
        uploadedAt: e.createdAt,
      })),
    })),
    notifications: notes,
  };
}

export async function requestErasure(db: DbOrTx, ctx: Ctx, reason?: string) {
  assertCanAct(ctx.actor);
  const cid = actorCustomerId(ctx.actor);
  if (!cid) throw forbidden();
  const [c] = await db
    .select({ a: customers.anonymizedAt })
    .from(customers)
    .where(and(eq(customers.id, cid), eq(customers.organizationId, ctx.orgId)));
  if (!c || c.a) throw new AppError("CONFLICT", "This profile has already been erased.");
  const [row] = await db
    .insert(dataRequests)
    .values({ organizationId: ctx.orgId, customerId: cid, kind: "deletion", reason: reason?.slice(0, 500) })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new AppError("CONFLICT", "You already have a pending erasure request.");
  await audit(db, ctx, { action: "privacy.erasure_requested", targetType: "data_request", targetId: row.id });
  await notifyRoles(db, {
    orgId: ctx.orgId,
    roles: ["owner", "admin"],
    type: "escalation_updated",
    title: "A customer asked for their data to be erased",
    body: "Review it in Admin → Privacy requests.",
  });
  return row;
}

export async function myDataRequests(db: DbOrTx, ctx: Ctx) {
  const cid = actorCustomerId(ctx.actor);
  if (!cid) throw forbidden();
  return db
    .select({
      id: dataRequests.id,
      kind: dataRequests.kind,
      status: dataRequests.status,
      createdAt: dataRequests.createdAt,
      processedAt: dataRequests.processedAt,
      note: dataRequests.note,
    })
    .from(dataRequests)
    .where(and(eq(dataRequests.customerId, cid), eq(dataRequests.organizationId, ctx.orgId)))
    .orderBy(sql`${dataRequests.createdAt} desc`);
}

export async function listDataRequests(db: DbOrTx, ctx: Ctx) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "privacy.manage");
  return db
    .select({
      r: dataRequests,
      name: customers.name,
      email: customers.email,
      anonymizedAt: customers.anonymizedAt,
    })
    .from(dataRequests)
    .innerJoin(
      customers,
      and(
        eq(customers.id, dataRequests.customerId),
        eq(customers.organizationId, dataRequests.organizationId),
      ),
    )
    .where(eq(dataRequests.organizationId, ctx.orgId))
    .orderBy(sql`${dataRequests.createdAt} desc`);
}

const REDACT_MESSAGE_TYPES = [
  "customer.feedback",
  "note.added",
  "info.provided",
  "case.reopened",
  "evidence.added",
  "diagnosis.completed",
  "claim.packet",
  "appointment.confirmed",
  "case.opened",
];

export async function processErasure(
  db: DbOrTx,
  ctx: Ctx,
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "privacy.manage");
  const actorId = ctx.actor.id;
  if (decision === "reject" && !note?.trim())
    throw new AppError("VALIDATION", "Say why the request is being declined.");
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(dataRequests)
      .where(and(eq(dataRequests.id, requestId), eq(dataRequests.organizationId, ctx.orgId)))
      .for("update");
    if (!r) throw notFound("Request");
    if (r.status !== "PENDING")
      throw new AppError("CONFLICT", `Request is already ${r.status.toLowerCase()}.`);
    if (decision === "reject") {
      await tx
        .update(dataRequests)
        .set({ status: "REJECTED", processedBy: actorId, processedAt: new Date(), note: note!.slice(0, 500) })
        .where(eq(dataRequests.id, r.id));
      await audit(tx, ctx, {
        action: "privacy.erasure_rejected",
        targetType: "data_request",
        targetId: r.id,
      });
      return { status: "REJECTED" as const };
    }
    const [c] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, r.customerId), eq(customers.organizationId, ctx.orgId)))
      .for("update");
    if (!c) throw notFound("Customer");
    const cases = await tx
      .select({ id: resolutionCases.id, state: resolutionCases.state })
      .from(resolutionCases)
      .where(and(eq(resolutionCases.customerId, c.id), eq(resolutionCases.organizationId, ctx.orgId)));
    if (cases.some((k) => !isTerminal(k.state)))
      throw new AppError(
        "CONFLICT",
        "This customer still has open cases. Close or cancel them first, then process the request.",
      );
    const caseIds = cases.map((k) => k.id);

    await tx.execute(sql`select set_config('orylo.redaction', 'on', true)`); // transaction-local: enables the audited redaction path
    if (caseIds.length) {
      await tx
        .update(caseEvents)
        .set({
          payload: {},
          message: sql`case when ${caseEvents.type} in (${sql.join(
            REDACT_MESSAGE_TYPES.map((t) => sql`${t}`),
            sql`, `,
          )}) or ${caseEvents.actorType} in ('customer','channel') then '[removed at the customer''s request]' else ${caseEvents.message} end`,
        })
        .where(and(eq(caseEvents.organizationId, ctx.orgId), inArray(caseEvents.caseId, caseIds)));
      await tx
        .delete(caseEvidence)
        .where(and(eq(caseEvidence.organizationId, ctx.orgId), inArray(caseEvidence.caseId, caseIds)));
      await tx
        .update(resolutionCases)
        .set({ title: "Redacted case", description: "" })
        .where(and(eq(resolutionCases.organizationId, ctx.orgId), inArray(resolutionCases.id, caseIds)));
    }
    await tx
      .delete(notifications)
      .where(and(eq(notifications.organizationId, ctx.orgId), eq(notifications.recipientCustomerId, c.id)));
    await tx
      .delete(customerAccessGrants)
      .where(
        and(eq(customerAccessGrants.organizationId, ctx.orgId), eq(customerAccessGrants.customerId, c.id)),
      );
    await tx
      .update(customers)
      .set({
        name: "Deleted customer",
        email: `deleted-${c.id}@invalid.example`,
        externalRef: `DELETED-${c.id.slice(0, 8)}`,
        userId: null,
        preferences: { notifyEmail: false, notifyInApp: false },
        anonymizedAt: new Date(),
      })
      .where(eq(customers.id, c.id));
    if (c.userId) await tx.delete(users).where(eq(users.id, c.userId)); // cascades sessions + credentials
    await tx
      .update(dataRequests)
      .set({
        status: "COMPLETED",
        processedBy: actorId,
        processedAt: new Date(),
        note: note?.slice(0, 500) ?? null,
      })
      .where(eq(dataRequests.id, r.id));
    await audit(tx, ctx, {
      action: "privacy.erased",
      targetType: "customer",
      targetId: c.id,
      metadata: { cases: caseIds.length },
    });
    return { status: "COMPLETED" as const };
  });
}
