import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import {
  assignments,
  caseEvents,
  caseObjectives,
  customers,
  resolutionCases,
  users,
  type CaseRow,
  type CaseState,
} from "@/db/schema";
import type { DbOrTx } from "@/db";
import { AppError, forbidden, notFound } from "./errors";
import { actorCustomerId, actorKind, type Ctx } from "./context";
import { canTransition } from "./case-machine";
import { requirePermission } from "./rbac";
import { audit } from "./audit";
import { notifyCustomer, notifyRoles, notifyUser } from "./notifications";

export interface ObjectiveSeed {
  key: string;
  label: string;
  required?: boolean;
}

export interface CreateCaseInput {
  customerId: string;
  title: string;
  description?: string;
  category: string;
  priority?: CaseRow["priority"];
  source?: "portal" | "egain" | "operator";
  workflowVersionId?: string | null;
  objectives?: ObjectiveSeed[];
  synthetic?: boolean;
}

/** Cases are only visible to (a) staff with case.read in the org, (b) the owning customer, (c) the engine. */
export function assertCaseAccess(ctx: Ctx, row: Pick<CaseRow, "organizationId" | "customerId">, write = false) {
  if (row.organizationId !== ctx.orgId) throw notFound("Case");
  const a = ctx.actor;
  if (a.type === "operator") return requirePermission(a.role, write ? "case.write" : "case.read");
  if (a.type === "customer" || a.type === "channel") {
    if (a.customerId !== row.customerId) throw notFound("Case"); // do not reveal existence
    return;
  }
}

/** Row-lock the case inside the current transaction. Serializes concurrent transitions/events. */
export async function lockCase(tx: DbOrTx, ctx: Ctx, caseIdOrRef: string): Promise<CaseRow> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseIdOrRef);
  const [row] = await tx
    .select()
    .from(resolutionCases)
    .where(
      and(
        eq(resolutionCases.organizationId, ctx.orgId),
        isUuid ? eq(resolutionCases.id, caseIdOrRef) : eq(resolutionCases.reference, caseIdOrRef),
      ),
    )
    .for("update");
  if (!row) throw notFound("Case");
  return row;
}

export async function appendEvent(
  tx: DbOrTx,
  ctx: Ctx,
  caseId: string,
  e: {
    type: string;
    message?: string;
    visibility?: "customer" | "internal";
    fromState?: CaseState;
    toState?: CaseState;
    payload?: Record<string, unknown>;
  },
) {
  // Caller holds the case row lock, so max(seq)+1 cannot race; unique(case_id, seq) is the backstop.
  const [m] = await tx
    .select({ n: sql<number>`coalesce(max(${caseEvents.seq}), 0)::int` })
    .from(caseEvents)
    .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.organizationId, ctx.orgId)));
  const seq = (m?.n ?? 0) + 1;
  const [row] = await tx
    .insert(caseEvents)
    .values({
      organizationId: ctx.orgId,
      caseId,
      seq,
      type: e.type,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      fromState: e.fromState,
      toState: e.toState,
      visibility: e.visibility ?? "customer",
      message: e.message,
      payload: e.payload ?? {},
    })
    .returning();
  return row;
}

export async function createCase(db: DbOrTx, ctx: Ctx, input: CreateCaseInput): Promise<CaseRow> {
  if (ctx.actor.type === "operator") requirePermission(ctx.actor.role, "case.write");
  const cid = actorCustomerId(ctx.actor);
  if (cid && cid !== input.customerId) throw forbidden("You can only open cases for yourself");
  return db.transaction(async (tx) => {
    const [cust] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, ctx.orgId)));
    if (!cust) throw notFound("Customer");

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"case-ref:" + ctx.orgId}))`);
    const [m] = await tx
      .select({ n: sql<number>`coalesce(max((regexp_replace(${resolutionCases.reference}, '\\D', '', 'g'))::int), 1000)::int` })
      .from(resolutionCases)
      .where(eq(resolutionCases.organizationId, ctx.orgId));
    const reference = `ORY-${(m?.n ?? 1000) + 1}`;

    const [row] = await tx
      .insert(resolutionCases)
      .values({
        organizationId: ctx.orgId,
        reference,
        customerId: input.customerId,
        title: input.title,
        description: input.description ?? "",
        category: input.category,
        priority: input.priority ?? "normal",
        source: input.source ?? "portal",
        workflowVersionId: input.workflowVersionId ?? null,
        synthetic: input.synthetic ?? true,
      })
      .returning();
    // Staggered created_at preserves the workflow's objective order for display.
    const base = Date.now();
    for (const [i, o] of (input.objectives ?? []).entries()) {
      await tx.insert(caseObjectives).values({
        organizationId: ctx.orgId,
        caseId: row.id,
        key: o.key,
        label: o.label,
        required: o.required ?? true,
        createdAt: new Date(base + i),
      });
    }
    await appendEvent(tx, ctx, row.id, {
      type: "case.opened",
      message: `Case ${reference} opened via ${input.source ?? "portal"}.`,
      toState: "OPEN",
    });
    await audit(tx, ctx, { action: "case.create", targetType: "case", targetId: row.id, metadata: { reference, source: input.source ?? "portal" } });
    return row;
  });
}

export interface TransitionOptions {
  to: CaseState;
  message?: string;
  visibility?: "customer" | "internal";
  type?: string;
  payload?: Record<string, unknown>;
  /** Optimistic guard: fail with CONFLICT if the case moved on since the caller read it. */
  expectedState?: CaseState;
  expectedVersion?: number;
}

export async function transitionCase(db: DbOrTx, ctx: Ctx, caseIdOrRef: string, opt: TransitionOptions) {
  try {
    return await db.transaction(async (tx) => {
      const row = await lockCase(tx, ctx, caseIdOrRef);
      assertCaseAccess(ctx, row, ctx.actor.type === "operator");
      const from = row.state;

      if (opt.expectedState && from !== opt.expectedState)
        throw new AppError("CONFLICT", `Case is ${from}, expected ${opt.expectedState}`, { current: from });
      if (opt.expectedVersion !== undefined && row.version !== opt.expectedVersion)
        throw new AppError("CONFLICT", "Case was modified by someone else; reload and retry", { current: row.version });

      // Idempotent: asking for the state the case is already in is a no-op, not an error.
      if (from === opt.to) return { changed: false as const, case: row };

      if (!canTransition(from, opt.to, actorKind(ctx.actor)))
        throw new AppError("ILLEGAL_TRANSITION", `Transition ${from} → ${opt.to} is not permitted for ${actorKind(ctx.actor)}`, {
          from,
          to: opt.to,
        });

      const now = new Date();
      const patch: Partial<typeof resolutionCases.$inferInsert> = {
        state: opt.to,
        version: row.version + 1,
        updatedAt: now,
      };
      if (opt.to === "VERIFIED_RESOLVED" || opt.to === "CANCELLED" || opt.to === "FAILED") patch.closedAt = now;
      if (opt.to === "REOPENED") {
        patch.closedAt = null;
        patch.reopenCount = row.reopenCount + 1;
      }
      if (opt.to === "ACTION_EXECUTED" && !row.firstActionAt) patch.firstActionAt = now;

      const [updated] = await tx
        .update(resolutionCases)
        .set(patch)
        .where(and(eq(resolutionCases.id, row.id), eq(resolutionCases.organizationId, ctx.orgId)))
        .returning();

      await appendEvent(tx, ctx, row.id, {
        type: opt.type ?? "case.transition",
        message: opt.message,
        visibility: opt.visibility,
        fromState: from,
        toState: opt.to,
        payload: opt.payload,
      });
      await audit(tx, ctx, {
        action: "case.transition",
        targetType: "case",
        targetId: row.id,
        metadata: { from, to: opt.to, reference: row.reference },
      });
      await transitionNotifications(tx, ctx, updated, from);
      return { changed: true as const, case: updated };
    });
  } catch (e) {
    throw mapDbError(e);
  }
}

/** Translate Postgres CHECK-style trigger failures into domain errors. */
export function mapDbError(e: unknown): unknown {
  const err = e as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  const code = err.code ?? err.cause?.code;
  const msg = err.cause?.message ?? err.message ?? "";
  if (code === "23514" && /VERIFIED_RESOLVED|append-only/i.test(msg))
    return new AppError("CONFLICT", msg.includes("append-only") ? "Evidence history is append-only" : "Verified outcome evidence is required before a case can be marked resolved");
  return e;
}

async function transitionNotifications(tx: DbOrTx, ctx: Ctx, c: CaseRow, from: CaseState) {
  const base = { orgId: ctx.orgId, caseId: c.id };
  switch (c.state) {
    case "AWAITING_CUSTOMER_INFORMATION":
      await notifyCustomer(tx, { ...base, customerId: c.customerId, type: "information_required", title: `We need a little more information (${c.reference})` });
      break;
    case "AWAITING_APPROVAL":
      await notifyRoles(tx, { ...base, roles: ["approver", "operator", "admin", "owner"], type: "approval_required", title: `Approval required: ${c.reference}`, body: c.title });
      break;
    case "VERIFIED_RESOLVED":
      await notifyCustomer(tx, { ...base, customerId: c.customerId, type: "outcome_verified", title: `Outcome verified (${c.reference})`, body: "We checked the result against the source system." });
      break;
    case "REOPENED":
      if (c.assigneeUserId) await notifyUser(tx, { ...base, userId: c.assigneeUserId, type: "case_reopened", title: `Case reopened: ${c.reference}` });
      else await notifyRoles(tx, { ...base, roles: ["operator"], type: "case_reopened", title: `Case reopened: ${c.reference}`, body: `Previously ${from}` });
      break;
    case "FAILED":
      await notifyCustomer(tx, { ...base, customerId: c.customerId, type: "action_failed", title: `We could not complete this (${c.reference})`, body: "A person will review it." });
      break;
    default:
  }
}

export async function addNote(db: DbOrTx, ctx: Ctx, caseId: string, message: string, visibility: "internal" | "customer" = "internal") {
  if (ctx.actor.type === "operator") requirePermission(ctx.actor.role, "notes.write");
  else if (visibility === "internal") throw forbidden("Only staff can add internal notes");
  return db.transaction(async (tx) => {
    const row = await lockCase(tx, ctx, caseId);
    assertCaseAccess(ctx, row);
    const ev = await appendEvent(tx, ctx, row.id, { type: "note.added", message: message.slice(0, 4000), visibility });
    await audit(tx, ctx, { action: "case.note", targetType: "case", targetId: row.id, metadata: { visibility } });
    return ev;
  });
}

export async function setObjective(
  tx: DbOrTx,
  ctx: Ctx,
  caseId: string,
  key: string,
  status: (typeof caseObjectives.$inferSelect)["status"],
  detail?: string,
) {
  const [o] = await tx
    .update(caseObjectives)
    .set({ status, detail, updatedAt: new Date(), verifiedAt: status === "VERIFIED" ? new Date() : null })
    .where(and(eq(caseObjectives.caseId, caseId), eq(caseObjectives.organizationId, ctx.orgId), eq(caseObjectives.key, key)))
    .returning();
  if (!o) throw notFound(`Objective ${key}`);
  await appendEvent(tx, ctx, caseId, { type: "objective.updated", message: `${o.label}: ${status}`, payload: { key, status } });
  return o;
}

export async function getObjectives(db: DbOrTx, orgId: string, caseId: string) {
  return db
    .select()
    .from(caseObjectives)
    .where(and(eq(caseObjectives.caseId, caseId), eq(caseObjectives.organizationId, orgId)))
    .orderBy(asc(caseObjectives.createdAt), asc(caseObjectives.key));
}

export async function assignCase(db: DbOrTx, ctx: Ctx, caseId: string, assigneeUserId: string | null, queueId?: string | null) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "case.assign");
  return db.transaction(async (tx) => {
    const row = await lockCase(tx, ctx, caseId);
    if (assigneeUserId) {
      const ok = await tx.execute(sql`select 1 from memberships where organization_id = ${ctx.orgId} and user_id = ${assigneeUserId} and status = 'active'`);
      if (ok.rows.length === 0) throw new AppError("VALIDATION", "Assignee is not an active member of this organization");
    }
    await tx.update(assignments).set({ active: false }).where(and(eq(assignments.caseId, row.id), eq(assignments.organizationId, ctx.orgId), eq(assignments.active, true)));
    await tx.insert(assignments).values({ organizationId: ctx.orgId, caseId: row.id, assigneeUserId, queueId: queueId ?? row.queueId, assignedBy: ctx.actor.id });
    const [updated] = await tx
      .update(resolutionCases)
      .set({ assigneeUserId, queueId: queueId ?? row.queueId, updatedAt: new Date(), version: row.version + 1 })
      .where(and(eq(resolutionCases.id, row.id), eq(resolutionCases.organizationId, ctx.orgId)))
      .returning();
    await appendEvent(tx, ctx, row.id, { type: "case.assigned", visibility: "internal", message: assigneeUserId ? "Case assigned" : "Case unassigned", payload: { assigneeUserId, queueId } });
    await audit(tx, ctx, { action: "case.assign", targetType: "case", targetId: row.id, metadata: { assigneeUserId, queueId } });
    if (assigneeUserId) await notifyUser(tx, { orgId: ctx.orgId, caseId: row.id, userId: assigneeUserId, type: "case_assigned", title: `Assigned to you: ${row.reference}`, body: row.title });
    return updated;
  });
}

export async function setPriority(db: DbOrTx, ctx: Ctx, caseId: string, p: CaseRow["priority"]) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "case.write");
  return db.transaction(async (tx) => {
    const row = await lockCase(tx, ctx, caseId);
    const [u] = await tx.update(resolutionCases).set({ priority: p, updatedAt: new Date() }).where(and(eq(resolutionCases.id, row.id), eq(resolutionCases.organizationId, ctx.orgId))).returning();
    await appendEvent(tx, ctx, row.id, { type: "case.priority", visibility: "internal", message: `Priority ${row.priority} → ${p}` });
    await audit(tx, ctx, { action: "case.priority", targetType: "case", targetId: row.id, metadata: { from: row.priority, to: p } });
    return u;
  });
}

export interface CaseFilters {
  q?: string;
  states?: CaseState[];
  priority?: CaseRow["priority"][];
  assigneeUserId?: string | "unassigned";
  category?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  sort?: "updated" | "opened" | "priority";
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function listCases(db: DbOrTx, ctx: Ctx, f: CaseFilters = {}) {
  const where: (SQL | undefined)[] = [eq(resolutionCases.organizationId, ctx.orgId)];
  if (ctx.actor.type === "operator") requirePermission(ctx.actor.role, "case.read");
  const cid = actorCustomerId(ctx.actor);
  if (cid) where.push(eq(resolutionCases.customerId, cid));
  else if (ctx.actor.type !== "operator" && ctx.actor.type !== "system") throw forbidden();
  if (f.states?.length) where.push(inArray(resolutionCases.state, f.states));
  if (f.priority?.length) where.push(inArray(resolutionCases.priority, f.priority));
  if (f.category) where.push(eq(resolutionCases.category, f.category));
  if (f.assigneeUserId === "unassigned") where.push(sql`${resolutionCases.assigneeUserId} is null`);
  else if (f.assigneeUserId) where.push(eq(resolutionCases.assigneeUserId, f.assigneeUserId));
  if (f.from) where.push(gte(resolutionCases.openedAt, f.from));
  if (f.to) where.push(lte(resolutionCases.openedAt, f.to));
  if (f.q?.trim()) {
    const like = `%${escapeLike(f.q.trim())}%`;
    where.push(or(ilike(resolutionCases.reference, like), ilike(resolutionCases.title, like), ilike(customers.name, like), ilike(customers.email, like)));
  }
  const order =
    f.sort === "opened"
      ? desc(resolutionCases.openedAt)
      : f.sort === "priority"
        ? sql`array_position(array['urgent','high','normal','low']::text[], ${resolutionCases.priority}::text), ${resolutionCases.updatedAt} desc`
        : desc(resolutionCases.updatedAt);
  const limit = Math.min(f.limit ?? 25, 100);
  const base = db
    .select({
      id: resolutionCases.id,
      reference: resolutionCases.reference,
      title: resolutionCases.title,
      state: resolutionCases.state,
      priority: resolutionCases.priority,
      category: resolutionCases.category,
      openedAt: resolutionCases.openedAt,
      updatedAt: resolutionCases.updatedAt,
      reopenCount: resolutionCases.reopenCount,
      synthetic: resolutionCases.synthetic,
      customerId: customers.id,
      customerName: customers.name,
      assigneeUserId: resolutionCases.assigneeUserId,
      assigneeName: users.name,
    })
    .from(resolutionCases)
    .innerJoin(customers, and(eq(customers.id, resolutionCases.customerId), eq(customers.organizationId, resolutionCases.organizationId)))
    .leftJoin(users, eq(users.id, resolutionCases.assigneeUserId))
    .where(and(...where));
  const rows = await base.orderBy(order).limit(limit).offset(f.offset ?? 0);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(resolutionCases)
    .innerJoin(customers, and(eq(customers.id, resolutionCases.customerId), eq(customers.organizationId, resolutionCases.organizationId)))
    .where(and(...where));
  return { rows, total: n, limit, offset: f.offset ?? 0 };
}

export async function findCase(db: DbOrTx, ctx: Ctx, idOrRef: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrRef);
  const [row] = await db
    .select()
    .from(resolutionCases)
    .where(and(eq(resolutionCases.organizationId, ctx.orgId), isUuid ? eq(resolutionCases.id, idOrRef) : eq(resolutionCases.reference, idOrRef)));
  if (!row) throw notFound("Case");
  assertCaseAccess(ctx, row);
  return row;
}

export async function reopenCase(db: DbOrTx, ctx: Ctx, caseId: string, reason: string) {
  if (!reason.trim()) throw new AppError("VALIDATION", "Tell us what did not work so we can pick up where we left off");
  const r = await transitionCase(db, ctx, caseId, {
    to: "REOPENED",
    type: "case.reopened",
    message: `Reopened: ${reason.slice(0, 500)}`,
    payload: { reason },
  });
  return r.case;
}
