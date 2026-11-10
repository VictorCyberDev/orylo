import { and, eq, gte, sql } from "drizzle-orm";
import { actionRequests, escalations, resolutionCases } from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { Ctx } from "./context";
import { requirePermission } from "./rbac";
import { forbidden } from "./errors";

export interface AnalyticsFilter {
  from?: Date;
  to?: Date;
  workflowKey?: string;
}
export interface ModelAssumptions {
  minutesSavedPerVerifiedOutcome: number;
  loadedCostPerHourUsd: number;
}
export const DEFAULT_ASSUMPTIONS: ModelAssumptions = { minutesSavedPerVerifiedOutcome: 18, loadedCostPerHourUsd: 28 };

const n = (x: unknown) => (x === null || x === undefined ? 0 : Number(x));
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Everything here is computed from persisted rows for ONE organization. Nothing is hard-coded.
 * `estimatedSavings` is the only modelled figure and is labelled as such with its assumptions.
 */
export async function computeAnalytics(db: DbOrTx, ctx: Ctx, f: AnalyticsFilter = {}, assumptions: ModelAssumptions = DEFAULT_ASSUMPTIONS) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "analytics.read");
  const org = ctx.orgId;
  const from = f.from ?? new Date(Date.now() - 90 * 86_400_000);
  const to = f.to ?? new Date();
  const wfJoin = f.workflowKey
    ? sql`and c.workflow_version_id in (select v.id from workflow_versions v join workflow_definitions d on d.id = v.definition_id where d.key = ${f.workflowKey} and v.organization_id = ${org})`
    : sql``;
  const base = sql`c.organization_id = ${org} and c.opened_at >= ${from} and c.opened_at <= ${to} ${wfJoin}`;

  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;

  const [totals] = await q<{ total: number; open: number; closed: number; verified: number; failed: number; cancelled: number; reopened: number; escalated_cases: number; partial: number; synthetic: number; avg_first_action_h: number | null; avg_ttr_h: number | null }>(sql`
    select count(*)::int as total,
      count(*) filter (where c.state not in ('VERIFIED_RESOLVED','CANCELLED','FAILED'))::int as open,
      count(*) filter (where c.state in ('VERIFIED_RESOLVED','CANCELLED','FAILED'))::int as closed,
      count(*) filter (where c.state = 'VERIFIED_RESOLVED')::int as verified,
      count(*) filter (where c.state = 'FAILED')::int as failed,
      count(*) filter (where c.state = 'CANCELLED')::int as cancelled,
      count(*) filter (where c.reopen_count > 0)::int as reopened,
      count(*) filter (where exists (select 1 from escalations e where e.case_id = c.id and e.reason_code not in ('CLAIM_HANDOFF','RESCHEDULE_REQUEST')))::int as escalated_cases,
      count(*) filter (where c.state <> 'VERIFIED_RESOLVED' and exists (select 1 from case_objectives o where o.case_id = c.id and o.status = 'VERIFIED'))::int as partial,
      count(*) filter (where c.synthetic)::int as synthetic,
      avg(extract(epoch from (c.first_action_at - c.opened_at))/3600) as avg_first_action_h,
      avg(extract(epoch from (c.closed_at - c.opened_at))/3600) filter (where c.state = 'VERIFIED_RESOLVED') as avg_ttr_h
    from resolution_cases c where ${base}`);

  const [actions] = await q<{ requested: number; succeeded: number; failed: number; denied: number }>(sql`
    select count(*)::int as requested,
      count(*) filter (where a.status = 'SUCCEEDED')::int as succeeded,
      count(*) filter (where a.status = 'FAILED')::int as failed,
      count(*) filter (where a.status = 'DENIED')::int as denied
    from action_requests a join resolution_cases c on c.id = a.case_id and c.organization_id = a.organization_id where ${base}`);

  const [attempts] = await q<{ total: number; errors: number }>(sql`
    select count(*)::int as total, count(*) filter (where t.status in ('FAILED','TIMEOUT'))::int as errors
    from action_attempts t join action_requests a on a.id = t.action_request_id join resolution_cases c on c.id = a.case_id where ${base}`);

  const [approvals] = await q<{ n: number; avg_wait_h: number | null }>(sql`
    select count(*)::int as n, avg(extract(epoch from (ap.created_at - a.created_at))/3600) as avg_wait_h
    from action_approvals ap join action_requests a on a.id = ap.action_request_id join resolution_cases c on c.id = a.case_id
    where ap.approver_type = 'operator' and ${base}`);

  const [repeat] = await q<{ repeaters: number; customers: number }>(sql`
    select count(*) filter (where k > 1)::int as repeaters, count(*)::int as customers
    from (select c.customer_id, count(*) as k from resolution_cases c where ${base} group by c.customer_id) x`);

  const aging = await q<{ bucket: string; n: number }>(sql`
    select case when age < interval '1 day' then '< 1 day' when age < interval '3 days' then '1–3 days' when age < interval '7 days' then '3–7 days' else '> 7 days' end as bucket, count(*)::int as n
    from (select now() - c.opened_at as age from resolution_cases c where ${base} and c.state not in ('VERIFIED_RESOLVED','CANCELLED','FAILED')) x group by 1`);

  const byCategory = await q<{ category: string; total: number; verified: number; open: number }>(sql`
    select c.category, count(*)::int as total, count(*) filter (where c.state = 'VERIFIED_RESOLVED')::int as verified,
      count(*) filter (where c.state not in ('VERIFIED_RESOLVED','CANCELLED','FAILED'))::int as open
    from resolution_cases c where ${base} group by c.category order by total desc`);

  const byWorkflow = await q<{ workflow: string | null; total: number; verified: number; escalated: number; avg_ttr_h: number | null }>(sql`
    select d.key as workflow, count(*)::int as total,
      count(*) filter (where c.state = 'VERIFIED_RESOLVED')::int as verified,
      count(*) filter (where c.state = 'ESCALATED')::int as escalated,
      avg(extract(epoch from (c.closed_at - c.opened_at))/3600) filter (where c.state = 'VERIFIED_RESOLVED') as avg_ttr_h
    from resolution_cases c left join workflow_versions v on v.id = c.workflow_version_id left join workflow_definitions d on d.id = v.definition_id
    where ${base} group by d.key order by total desc`);

  const objectives = await q<{ key: string; status: string; n: number }>(sql`
    select o.key, o.status, count(*)::int as n from case_objectives o join resolution_cases c on c.id = o.case_id where ${base} group by o.key, o.status order by o.key`);

  const verifiedOutcomes = totals?.verified ?? 0;
  const objectivesVerified = objectives.filter((o) => o.status === "VERIFIED").reduce((a, o) => a + o.n, 0);
  const hours = (objectivesVerified * assumptions.minutesSavedPerVerifiedOutcome) / 60;

  const total = n(totals?.total);
  const pct = (a: number, b: number) => (b ? round((a / b) * 100) : null);
  return {
    range: { from, to },
    measured: {
      cases: { total, open: n(totals?.open), closed: n(totals?.closed), verifiedResolved: verifiedOutcomes, failed: n(totals?.failed), cancelled: n(totals?.cancelled), partiallyResolved: n(totals?.partial), synthetic: n(totals?.synthetic) },
      reopenedCases: n(totals?.reopened),
      reopenRatePct: pct(n(totals?.reopened), total),
      repeatContact: { customersWithMultipleCases: n(repeat?.repeaters), customers: n(repeat?.customers), ratePct: pct(n(repeat?.repeaters), n(repeat?.customers)) },
      humanEscalationRatePct: pct(n(totals?.escalated_cases), total),
      escalatedCases: n(totals?.escalated_cases),
      actions: { requested: n(actions?.requested), succeeded: n(actions?.succeeded), failed: n(actions?.failed), denied: n(actions?.denied), completionRatePct: pct(n(actions?.succeeded), n(actions?.requested)) },
      errorRatePct: pct(n(attempts?.errors), n(attempts?.total)),
      attempts: n(attempts?.total),
      timeToActionHours: totals?.avg_first_action_h === null ? null : round(n(totals?.avg_first_action_h), 2),
      timeToVerifiedResolutionHours: totals?.avg_ttr_h === null ? null : round(n(totals?.avg_ttr_h), 2),
      approvalWaitHours: approvals?.avg_wait_h === null ? null : round(n(approvals?.avg_wait_h), 2),
      approvalsRecorded: n(approvals?.n),
      aging: ["< 1 day", "1–3 days", "3–7 days", "> 7 days"].map((b) => ({ bucket: b, count: n(aging.find((a) => a.bucket === b)?.n) })),
      byCategory: byCategory.map((r) => ({ category: r.category, total: n(r.total), verified: n(r.verified), open: n(r.open) })),
      byWorkflow: byWorkflow.map((r) => ({ workflow: r.workflow ?? "(none)", total: n(r.total), verified: n(r.verified), escalated: n(r.escalated), avgHoursToVerified: r.avg_ttr_h === null ? null : round(n(r.avg_ttr_h), 2) })),
      objectives: objectives.map((o) => ({ key: o.key, status: o.status, count: n(o.n) })),
    },
    /** MODEL, not measurement. Shown separately in the UI with the assumptions editable by the viewer. */
    estimatedSavings: { kind: "illustrative-model" as const, assumptions, verifiedObjectives: objectivesVerified, hoursSaved: round(hours, 1), valueUsd: round(hours * assumptions.loadedCostPerHourUsd, 0) },
  };
}

export async function dashboardSummary(db: DbOrTx, ctx: Ctx) {
  const org = ctx.orgId;
  const rows = await db
    .select({ state: resolutionCases.state, n: sql<number>`count(*)::int` })
    .from(resolutionCases)
    .where(eq(resolutionCases.organizationId, org))
    .groupBy(resolutionCases.state);
  const by = Object.fromEntries(rows.map((r) => [r.state, r.n])) as Record<string, number>;
  const [esc] = await db.select({ n: sql<number>`count(*)::int` }).from(escalations).where(and(eq(escalations.organizationId, org), sql`${escalations.status} in ('OPEN','ACKNOWLEDGED','IN_PROGRESS')`));
  const [fa] = await db.select({ n: sql<number>`count(*)::int` }).from(actionRequests).where(and(eq(actionRequests.organizationId, org), eq(actionRequests.status, "FAILED"), gte(actionRequests.updatedAt, new Date(Date.now() - 7 * 86_400_000))));
  const open = Object.entries(by).filter(([s]) => !["VERIFIED_RESOLVED", "CANCELLED", "FAILED"].includes(s)).reduce((a, [, c]) => a + c, 0);
  return {
    open,
    needsAttention: (by.ESCALATED ?? 0) + (by.BLOCKED ?? 0) + (by.REOPENED ?? 0) + (by.AWAITING_APPROVAL ?? 0),
    openEscalations: esc?.n ?? 0,
    pendingApprovals: by.AWAITING_APPROVAL ?? 0,
    verifiedResolved: by.VERIFIED_RESOLVED ?? 0,
    reopened: by.REOPENED ?? 0,
    recentFailedActions: fa?.n ?? 0,
    byState: by,
  };
}

