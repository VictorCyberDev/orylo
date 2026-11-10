import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Check } from "lucide-react";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { Alert, Badge, Card, LinkButton } from "@/components/ui";
export const metadata: Metadata = { title: "Pricing", description: "Provisional early-access pricing experiments for Orylo. Not confirmed market pricing.", alternates: { canonical: "/pricing" } };
export const dynamic = "force-dynamic";

const FALLBACK = [
  { key: "pilot", name: "Pilot (early access)", priceCentsMonthly: 0, entitlements: { maxOperators: 3, includedVerifiedOutcomes: 50, workflows: 1, apiAccess: false, customBranding: false } },
  { key: "team", name: "Team (experiment)", priceCentsMonthly: 49_000, entitlements: { maxOperators: 15, includedVerifiedOutcomes: 500, workflows: 5, apiAccess: true, customBranding: false } },
  { key: "scale", name: "Scale (experiment)", priceCentsMonthly: 149_000, entitlements: { maxOperators: 100, includedVerifiedOutcomes: 3000, workflows: 25, apiAccess: true, customBranding: true } },
];
export default async function Pricing() {
  const rows = await db.select().from(plans).orderBy(asc(plans.priceCentsMonthly)).catch(() => FALLBACK);
  const list = rows.length ? rows : FALLBACK;
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="mb-8 max-w-3xl space-y-3"><p className="t-label">Pricing</p><h1 className="t-h1">Priced on verified outcomes, not conversations.</h1>
        <p className="text-muted">The unit is a <strong>verified customer outcome</strong>: an objective whose result was read back from the source system. That is intentionally not the same as a &ldquo;resolved conversation&rdquo; counted by a chat or AI-agent platform.</p></header>
      <Alert tone="warning" title="These are experiments, not market prices">Figures below are provisional hypotheses used to test willingness to pay. There are no customers, no contracts and no live billing — the in-product billing provider is a test provider that cannot charge a card.</Alert>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {list.map((p) => (
          <li key={p.key}><Card className="flex h-full flex-col p-6">
            <div className="flex items-center justify-between"><h2 className="t-h2">{p.name}</h2><Badge>Experiment</Badge></div>
            <p className="mt-4 text-4xl font-semibold tracking-tight t-num">{p.priceCentsMonthly === 0 ? "$0" : `$${(p.priceCentsMonthly / 100).toLocaleString("en-US")}`}<span className="ml-1 text-base font-normal text-muted">/ month</span></p>
            <ul className="mt-5 space-y-2 text-sm">
              {[`${p.entitlements.maxOperators} team members`, `${p.entitlements.includedVerifiedOutcomes.toLocaleString("en-US")} verified outcomes included`, `${p.entitlements.workflows} workflow${p.entitlements.workflows > 1 ? "s" : ""}`, p.entitlements.apiAccess ? "API & eGain action keys" : "No API access", p.entitlements.customBranding ? "Custom organization branding" : "Standard branding"].map((f) => (
                <li key={f} className="flex gap-2"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-success" />{f}</li>
              ))}
            </ul>
            <LinkButton href="/contact" variant={p.priceCentsMonthly === 0 ? "primary" : "secondary"} className="mt-auto">Request access</LinkButton>
          </Card></li>
        ))}
      </ul>
      <section className="mt-10 max-w-3xl space-y-2 text-sm text-muted"><h2 className="t-h3 text-fg">What the experiment is testing</h2><p>Whether buyers prefer paying per verified outcome over per resolved conversation or per seat, and at what level. Nothing here has been validated with a customer.</p></section>
    </div>
  );
}
