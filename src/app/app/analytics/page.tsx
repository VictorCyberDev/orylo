import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { computeAnalytics, DEFAULT_ASSUMPTIONS } from "@/domain/analytics";
import { Alert, Badge, buttonClass, Card, CardHeader, DataTable, Field, PageHeader, Td, Th, inputClass } from "@/components/ui";
import { WORKFLOW_OPTIONS } from "@/components/workflow-options";
export const metadata: Metadata = { title: "Analytics" };

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return <div role="img" aria-label={`${label}: ${value}`} className="h-3 rounded bg-surface-3"><div className="h-3 rounded bg-[var(--chart-1)]" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>;
}
const fmt = (v: number | null, suf = "") => (v === null ? "—" : `${v}${suf}`);
export default async function Analytics({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; workflow?: string; mins?: string; rate?: string }> }) {
  const s = await requireStaff("analytics.read");
  const sp = await searchParams;
  const assumptions = { minutesSavedPerVerifiedOutcome: Number(sp.mins) > 0 ? Number(sp.mins) : DEFAULT_ASSUMPTIONS.minutesSavedPerVerifiedOutcome, loadedCostPerHourUsd: Number(sp.rate) > 0 ? Number(sp.rate) : DEFAULT_ASSUMPTIONS.loadedCostPerHourUsd };
  const a = await computeAnalytics(db, s.ctx, { from: sp.from ? new Date(sp.from) : undefined, to: sp.to ? new Date(sp.to + "T23:59:59Z") : undefined, workflowKey: sp.workflow || undefined }, assumptions);
  const m = a.measured;
  const tiles: [string, string][] = [
    ["Cases opened", String(m.cases.total)], ["Open", String(m.cases.open)], ["Closed", String(m.cases.closed)], ["Verified resolved", String(m.cases.verifiedResolved)], ["Partially resolved", String(m.cases.partiallyResolved)],
    ["Reopened", `${m.reopenedCases}${m.reopenRatePct === null ? "" : ` (${m.reopenRatePct}%)`}`], ["Repeat-contact customers", `${m.repeatContact.customersWithMultipleCases}/${m.repeatContact.customers}`], ["Human escalation rate", fmt(m.humanEscalationRatePct, "%")],
    ["Action completion", fmt(m.actions.completionRatePct, "%")], ["Attempt error rate", fmt(m.errorRatePct, "%")], ["Time to action", fmt(m.timeToActionHours, " h")], ["Time to verified resolution", fmt(m.timeToVerifiedResolutionHours, " h")], ["Approval wait", fmt(m.approvalWaitHours, " h")],
  ];
  return (
    <>
      <PageHeader title="Analytics" description="Measured figures are computed from this organization's stored records. The savings estimate is a labelled model." />
      <Card className="mb-6 p-4"><form method="get" aria-label="Analytics filters" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div><label htmlFor="from" className="t-label mb-1.5 block">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className={inputClass} /></div>
        <div><label htmlFor="to" className="t-label mb-1.5 block">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className={inputClass} /></div>
        <div className="lg:col-span-2"><label htmlFor="workflow" className="t-label mb-1.5 block">Workflow</label><select id="workflow" name="workflow" defaultValue={sp.workflow ?? ""} className={inputClass}><option value="">All workflows</option>{WORKFLOW_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="flex items-end"><button className={buttonClass("primary")} type="submit">Apply</button></div>
      </form></Card>
      <section aria-labelledby="meas"><div className="mb-3 flex items-center gap-2"><h2 id="meas" className="t-h2">Measured</h2><Badge tone="success">From stored records</Badge></div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{tiles.map(([k, v]) => <div key={k} className="rounded-lg border border-border bg-surface p-4"><dt className="t-label">{k}</dt><dd className="mt-2 text-2xl font-semibold t-num">{v}</dd></div>)}</dl>
        <p className="t-caption mt-2">{m.cases.synthetic} of {m.cases.total} cases are synthetic demo records. Small samples: do not read these as performance claims.</p>
      </section>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Open-case aging" /><div className="space-y-3 p-5">{m.aging.map((x) => <div key={x.bucket} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm"><span>{x.bucket}</span><Bar value={x.count} max={Math.max(1, ...m.aging.map((y) => y.count))} label={x.bucket} /><span className="t-num text-right">{x.count}</span></div>)}</div></Card>
        <Card><CardHeader title="By outcome category" />
          <DataTable caption="Cases by category"><thead><tr><Th>Category</Th><Th>Total</Th><Th>Verified</Th><Th>Open</Th></tr></thead><tbody>{m.byCategory.length ? m.byCategory.map((r) => <tr key={r.category}><Td>{r.category.replace("_", " ")}</Td><Td className="t-num">{r.total}</Td><Td className="t-num">{r.verified}</Td><Td className="t-num">{r.open}</Td></tr>) : <tr><Td colSpan={4} className="text-muted">No data in range</Td></tr>}</tbody></DataTable></Card>
        <Card className="lg:col-span-2"><CardHeader title="Workflow performance" />
          <DataTable caption="Workflow performance"><thead><tr><Th>Workflow</Th><Th>Cases</Th><Th>Verified</Th><Th>Escalated now</Th><Th>Avg hours to verified</Th></tr></thead><tbody>{m.byWorkflow.length ? m.byWorkflow.map((r) => <tr key={r.workflow}><Td>{r.workflow}</Td><Td className="t-num">{r.total}</Td><Td className="t-num">{r.verified}</Td><Td className="t-num">{r.escalated}</Td><Td className="t-num">{fmt(r.avgHoursToVerified)}</Td></tr>) : <tr><Td colSpan={5} className="text-muted">No data in range</Td></tr>}</tbody></DataTable></Card>
        <Card className="lg:col-span-2"><CardHeader title="Objectives" description="Independent per-objective status across cases" />
          <DataTable caption="Objective statuses"><thead><tr><Th>Objective</Th><Th>Status</Th><Th>Count</Th></tr></thead><tbody>{m.objectives.length ? m.objectives.map((r) => <tr key={r.key + r.status}><Td className="t-code">{r.key}</Td><Td>{r.status}</Td><Td className="t-num">{r.count}</Td></tr>) : <tr><Td colSpan={3} className="text-muted">No data in range</Td></tr>}</tbody></DataTable></Card>
      </div>
      <section aria-labelledby="model" className="mt-8"><div className="mb-3 flex items-center gap-2"><h2 id="model" className="t-h2">Estimated operational savings</h2><Badge tone="warning">Illustrative model — not measured</Badge></div>
        <Card className="p-5"><p className="text-3xl font-semibold t-num">${a.estimatedSavings.valueUsd.toLocaleString("en-US")}</p>
          <p className="t-caption mt-1">= {a.estimatedSavings.verifiedObjectives} verified objectives × {assumptions.minutesSavedPerVerifiedOutcome} min × ${assumptions.loadedCostPerHourUsd}/h ({a.estimatedSavings.hoursSaved} h). The minutes and rate are assumptions you can change; they are not derived from this data.</p>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3" aria-label="Savings model assumptions">
            <input type="hidden" name="from" value={sp.from ?? ""} /><input type="hidden" name="to" value={sp.to ?? ""} /><input type="hidden" name="workflow" value={sp.workflow ?? ""} />
            <Field id="mins" label="Minutes saved / verified objective"><input id="mins" name="mins" type="number" min={1} defaultValue={assumptions.minutesSavedPerVerifiedOutcome} className={inputClass} /></Field>
            <Field id="rate" label="Loaded cost per hour (USD)"><input id="rate" name="rate" type="number" min={1} defaultValue={assumptions.loadedCostPerHourUsd} className={inputClass} /></Field>
            <button className={buttonClass("secondary")} type="submit">Recompute</button>
          </form></Card>
      </section>
      <div className="mt-6"><Alert tone="info">Orylo counts a <strong>verified customer outcome</strong> (an objective read back from the source system). That is deliberately different from a platform&apos;s &ldquo;resolved conversation&rdquo;.</Alert></div>
    </>
  );
}
