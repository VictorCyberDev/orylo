import Link from "next/link";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { dashboardSummary, computeAnalytics } from "@/domain/analytics";
import { listCases } from "@/domain/cases";
import { can } from "@/domain/rbac";
import { Alert, Card, CardHeader, DataTable, EmptyState, PageHeader, StateBadge, Td, Th, When } from "@/components/ui";
import { AutoRefresh } from "@/components/client";

function Stat({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: "warn" }) {
  const inner = (<><p className="t-label">{label}</p><p className={`mt-2 text-3xl font-semibold tracking-tight t-num ${tone === "warn" && Number(value) > 0 ? "text-warning" : ""}`}>{value}</p></>);
  return href ? <Link href={href} className="block rounded-lg border border-border bg-surface p-4 shadow-sm hover:border-border-strong">{inner}</Link> : <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">{inner}</div>;
}
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const s = await requireStaff();
  const sp = await searchParams;
  const sum = await dashboardSummary(db, s.ctx);
  const attention = await listCases(db, s.ctx, { states: ["ESCALATED", "AWAITING_APPROVAL", "BLOCKED", "REOPENED", "FAILED"], limit: 8, sort: "priority" });
  const an = can(s.role, "analytics.read") ? await computeAnalytics(db, s.ctx, {}) : null;
  const m = an?.measured;
  return (
    <>
      <AutoRefresh everyMs={20000} />
      <PageHeader title="Command center" description="Live from stored records. Synthetic demo records are labelled." />
      {sp.denied ? <div className="mb-4"><Alert tone="warning" title="You don't have access to that page">Ask an owner if you need it.</Alert></div> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="Open cases" value={sum.open} href="/app/cases" />
        <Stat label="Need attention" value={sum.needsAttention} href="/app/cases?state=ESCALATED&state=AWAITING_APPROVAL&state=BLOCKED&state=REOPENED" tone="warn" />
        <Stat label="Pending approvals" value={sum.pendingApprovals} href="/app/approvals" tone="warn" />
        <Stat label="Open escalations" value={sum.openEscalations} href="/app/escalations" tone="warn" />
        <Stat label="Verified resolved" value={sum.verifiedResolved} href="/app/cases?state=VERIFIED_RESOLVED" />
        <Stat label="Failed actions (7d)" value={sum.recentFailedActions} tone="warn" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card aria-labelledby="att-h"><CardHeader id="att-h" title="Needs attention" description="Escalated, awaiting approval, blocked, reopened, failed" />
          {attention.rows.length === 0 ? <EmptyState title="All clear">No case is waiting on a person right now.</EmptyState> : (
            <DataTable caption="Cases needing attention"><thead><tr><Th>Case</Th><Th>Customer</Th><Th>State</Th><Th>Priority</Th><Th>Updated</Th></tr></thead>
              <tbody>{attention.rows.map((r) => <tr key={r.id} className="hover:bg-surface-2"><Td><Link href={`/app/cases/${r.reference}`} className="t-code underline">{r.reference}</Link><div className="t-caption">{r.title}</div></Td><Td>{r.customerName}</Td><Td><StateBadge state={r.state} /></Td><Td className="capitalize">{r.priority}</Td><Td><When at={r.updatedAt} /></Td></tr>)}</tbody></DataTable>
          )}
        </Card>
        <Card aria-labelledby="out-h"><CardHeader id="out-h" title="Outcomes (measured)" description="Last 90 days, from stored records" />
          {m ? (
            <dl className="divide-y divide-border text-sm">
              {([["Cases opened", m.cases.total], ["Verified resolved", m.cases.verifiedResolved], ["Partially resolved", m.cases.partiallyResolved], ["Reopened", m.reopenedCases], ["Escalation rate", m.humanEscalationRatePct === null ? "—" : `${m.humanEscalationRatePct}%`], ["Time to action", m.timeToActionHours === null ? "—" : `${m.timeToActionHours} h`], ["Time to verified resolution", m.timeToVerifiedResolutionHours === null ? "—" : `${m.timeToVerifiedResolutionHours} h`]] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-5 py-2.5"><dt className="text-muted">{k}</dt><dd className="t-num font-medium">{v}</dd></div>)}
            </dl>
          ) : <EmptyState title="Analytics not available for your role" />}
          <p className="border-t border-border px-5 py-3 t-caption">{m ? `${m.cases.synthetic} of ${m.cases.total} cases are synthetic demo records.` : ""} <Link className="underline" href="/app/analytics">Full analytics</Link></p>
        </Card>
      </div>
    </>
  );
}
