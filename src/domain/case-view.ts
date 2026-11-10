import { and, asc, eq } from "drizzle-orm";
import { caseEvents, customers, resolutionCases, users } from "@/db/schema";
import type { DbOrTx } from "@/db";
import { actorCustomerId, type Ctx } from "./context";
import { assertCaseAccess, getObjectives } from "./cases";
import { notFound } from "./errors";
import { actionsForCase } from "./actions";
import { customerLedgerView, ledgerForCase } from "./ledger";
import { escalationsForCase } from "./escalation";
import { listEvidence } from "./uploads";
import { executionView } from "@/workflows/engine";
import { STATE_LABEL } from "./case-machine";

/** One server-side projection used by portal, operator console and the eGain API. Customer audiences get a reduced view. */
export async function getCaseView(db: DbOrTx, ctx: Ctx, idOrRef: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrRef);
  const [row] = await db
    .select()
    .from(resolutionCases)
    .where(and(eq(resolutionCases.organizationId, ctx.orgId), isUuid ? eq(resolutionCases.id, idOrRef) : eq(resolutionCases.reference, idOrRef)));
  if (!row) throw notFound("Case");
  assertCaseAccess(ctx, row);
  const customerView = !!actorCustomerId(ctx.actor);
  const [cust] = await db.select({ name: customers.name, email: customers.email, externalRef: customers.externalRef }).from(customers).where(and(eq(customers.id, row.customerId), eq(customers.organizationId, ctx.orgId)));
  const [assignee] = row.assigneeUserId ? await db.select({ name: users.name }).from(users).where(eq(users.id, row.assigneeUserId)) : [];
  const objectives = await getObjectives(db, ctx.orgId, row.id);
  const allEvents = await db.select().from(caseEvents).where(and(eq(caseEvents.caseId, row.id), eq(caseEvents.organizationId, ctx.orgId))).orderBy(asc(caseEvents.seq));
  const events = (customerView ? allEvents.filter((e) => e.visibility === "customer") : allEvents).map((e) => ({
    seq: e.seq,
    type: e.type,
    message: e.message,
    visibility: e.visibility,
    actor: customerView ? (e.actorType === "customer" || e.actorType === "channel" ? "You" : e.actorType === "operator" ? "Our team" : "Orylo") : `${e.actorType}${e.actorId ? `:${e.actorId.slice(0, 12)}` : ""}`,
    fromState: e.fromState,
    toState: e.toState,
    at: e.createdAt,
    payload: customerView ? undefined : e.payload,
  }));
  const actions = await actionsForCase(db, ctx, row.id);
  const ledgerRows = await ledgerForCase(db, ctx.orgId, row.id);
  const ledger = customerView ? ledgerRows.map(customerLedgerView) : ledgerRows;
  const escalations = await escalationsForCase(db, ctx, row.id);
  const evidence = await listEvidence(db, ctx, row.id);
  const execution = await executionView(db, ctx, row.id);
  const verifiedCount = objectives.filter((o) => o.status === "VERIFIED").length;
  const requiredCount = objectives.filter((o) => o.required && o.status !== "NOT_APPLICABLE").length;
  return {
    case: { id: row.id, reference: row.reference, title: row.title, description: row.description, state: row.state, stateLabel: STATE_LABEL[row.state], category: row.category, priority: row.priority, openedAt: row.openedAt, closedAt: row.closedAt, reopenCount: row.reopenCount, version: row.version, synthetic: row.synthetic, source: row.source, assigneeUserId: customerView ? undefined : row.assigneeUserId, assigneeName: assignee?.name },
    customer: customerView ? { name: cust?.name } : cust,
    objectives: objectives.map((o) => ({ key: o.key, label: o.label, status: o.status, required: o.required, detail: o.detail, verifiedAt: o.verifiedAt })),
    progress: { verified: verifiedCount, required: requiredCount },
    events,
    actions,
    ledger,
    escalations,
    evidence,
    execution,
  };
}
export type CaseView = Awaited<ReturnType<typeof getCaseView>>;
