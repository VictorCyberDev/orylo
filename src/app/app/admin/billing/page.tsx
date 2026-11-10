import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { billingOverview, planCatalog } from "@/domain/billing";
import { can } from "@/domain/rbac";
import { PlanForm } from "@/components/admin-forms";
import { ActionForm, SubmitButton } from "@/components/client";
import { Alert, Badge, Card, CardHeader, DataTable, Money, PageHeader, Progress, Td, Th, When } from "@/components/ui";
import { cancelSubscriptionAction } from "../../../actions";
export const metadata: Metadata = { title: "Plan & usage" };
export default async function Billing() {
  const s = await requireStaff("billing.read");
  const o = await billingOverview(db, s.ctx);
  const plans = await planCatalog(db);
  const e = o.plan.entitlements;
  return (
    <>
      <PageHeader title="Plan & usage" description="Test billing only: no card is collected and nothing is ever charged." />
      <div className="mb-4"><Alert tone="warning" title="Provisional pricing experiments">Plan prices are hypotheses, not validated market prices. Usage counts verified outcomes (read back from the source), not conversations.</Alert></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title={o.plan.name} action={<Badge tone={o.subscription.status === "cancelled" ? "danger" : "info"}>{o.subscription.status}</Badge>} description={`Provider: ${o.subscription.provider} (test) · period ends`} />
          <div className="space-y-4 p-5 text-sm">
            <p className="text-3xl font-semibold t-num">{o.plan.priceCentsMonthly === 0 ? "$0" : <Money cents={o.plan.priceCentsMonthly} />}<span className="text-base font-normal text-muted"> / month</span></p>
            {o.subscription.trialEndsAt ? <p>Trial ends <When at={o.subscription.trialEndsAt} /></p> : null}
            <div><p className="mb-1">Verified outcomes: <strong className="t-num">{o.usage.verifiedOutcomes}</strong> of {e.includedVerifiedOutcomes}</p><Progress value={o.usage.verifiedOutcomes} max={e.includedVerifiedOutcomes} label="Verified outcomes used" /></div>
            <div><p className="mb-1">Team members: <strong className="t-num">{o.usage.members}</strong> of {e.maxOperators}</p><Progress value={o.usage.members} max={e.maxOperators} label="Members used" /></div>
            <p>Actions executed this period: <strong className="t-num">{o.usage.actionsExecuted}</strong> · API keys: {o.usage.apiKeys} · API access: {e.apiAccess ? "yes" : "no"} · Custom branding: {e.customBranding ? "yes" : "no"}</p>
          </div>
          {can(s.role, "billing.manage") ? <div className="space-y-4 border-t border-border p-5"><PlanForm plans={plans.map((p) => ({ key: p.key, name: `${p.name} — $${p.priceCentsMonthly / 100}/mo` }))} current={o.plan.key} /><ActionForm action={cancelSubscriptionAction}><SubmitButton variant="danger">Cancel subscription (test)</SubmitButton></ActionForm></div> : <p className="border-t border-border p-5 t-caption">Only owners can change the plan.</p>}
        </Card>
        <Card><CardHeader title="Invoice history" description="Test-mode representations" />
          {o.invoices.length === 0 ? <p className="p-5 text-sm text-muted">No invoices yet.</p> : <DataTable caption="Invoices"><thead><tr><Th>Period</Th><Th>Amount</Th><Th>Status</Th></tr></thead><tbody>{o.invoices.map((i) => <tr key={i.id}><Td><When at={i.periodStart} /></Td><Td><Money cents={i.amountCents} /></Td><Td><Badge>{i.status} (test)</Badge></Td></tr>)}</tbody></DataTable>}</Card>
      </div>
    </>
  );
}
