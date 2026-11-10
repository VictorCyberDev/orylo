import Link from "next/link";
import { ArrowRight, Check, FileCheck2, Gavel, ShieldCheck, Workflow } from "lucide-react";
import { brand } from "@/config/brand";
import { LinkButton, Badge, Card } from "@/components/ui";
import { ResolutionExplorer } from "@/components/resolution-explorer";
import { solutions } from "@/content/solutions";

export default function Home() {
  const jsonLd = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: brand.name, applicationCategory: "BusinessApplication", description: brand.description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Early-access pilot (provisional)" } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden">
        <div aria-hidden className="hairline-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-24">
          <div className="space-y-6">
            <Badge tone="accent">Early access · built on synthetic demo data</Badge>
            <h1 className="t-display">A conversation isn&apos;t a resolution.</h1>
            <p className="t-body-lg max-w-xl">{brand.name} sits between a support interaction and a real outcome. It finds what went wrong, checks what is allowed, acts with the customer&apos;s consent, and verifies the result before it says &ldquo;done&rdquo;.</p>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/demo" size="lg">Try the live demo <ArrowRight size={18} aria-hidden /></LinkButton>
              <LinkButton href="/contact" variant="secondary" size="lg">Request early access</LinkButton>
            </div>
            <p className="t-caption">No customers, metrics or testimonials are claimed on this site. Everything you can run is a synthetic scenario.</p>
          </div>
          <ResolutionExplorer />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="problem">
        <h2 id="problem" className="t-h1 max-w-2xl">Most &ldquo;resolved&rdquo; cases are just closed.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[["A chatbot conversation", "is not a resolution."], ["A refund request", "is not a refund."], ["A cancellation request", "is not a stopped subscription."], ["An escalation", "is not a solved complaint."], ["A technician appointment", "is not restored service."]].map(([a, b]) => (
            <Card key={a} className="p-5"><p className="font-semibold">{a}</p><p className="mt-1 text-muted">{b}</p></Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="t-h1">Detect. Decide. Execute. Verify.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [FileCheck2, "Detect", "Finds the earlier request, the account's true state, and what the customer already told you — so nobody starts over."],
              [Gavel, "Decide", "Versioned, approved policy and consent decide what is allowed. Contradictory or stale policy means a person, not a guess."],
              [Workflow, "Execute", "A typed, idempotent Action Gateway performs the change once, with retries that can never double-apply."],
              [ShieldCheck, "Verify", "Reads the result back and records it in an append-only, hash-chained ledger. Only verified evidence can mark a case resolved."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof ShieldCheck;
              return <Card key={t as string} className="p-5"><I aria-hidden className="mb-3 text-accent-text" /><h3 className="t-h3">{t as string}</h3><p className="mt-1.5 text-sm text-muted">{d as string}</p></Card>;
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="values">
        <h2 id="values" className="t-h1">For the customer. For the operator. For the business.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Never start over", "The customer sees what we know, what we don't, what needs their yes, what actually succeeded, and how to reach a person."],
            ["Know what can safely happen next", "Operators see the evidence and the recommendation first, then only the actions policy and role allow."],
            ["Measure outcomes, not conversations", "Metrics come from stored records: verified objectives, reopen rate, time to verified resolution. Savings figures are labelled models."],
          ].map(([t, d]) => <Card key={t} className="p-6"><h3 className="t-h3">{t}</h3><p className="mt-2 text-muted">{d}</p></Card>)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6" aria-labelledby="sol">
        <div className="flex items-end justify-between gap-4"><h2 id="sol" className="t-h1">Solutions</h2><Link href="/solutions" className="text-sm underline">All solutions</Link></div>
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {solutions.map((s) => (
            <li key={s.slug}><Link href={`/solutions/${s.slug}`} className="block h-full rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong">
              <div className="mb-2 flex items-center justify-between gap-2"><h3 className="t-h3">{s.name}</h3><Badge tone={s.status === "working" ? "success" : "neutral"}>{s.status === "working" ? "Working (synthetic)" : "Roadmap"}</Badge></div>
              <p className="text-sm text-muted">{s.short}</p>
            </Link></li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="gov">
        <h2 id="gov" className="t-h1">Security and governance, stated plainly</h2>
        <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          {["Tenant isolation enforced in every query and by composite foreign keys", "Role-based permissions, with separation of duties for policy and workflow changes", "Consent captured with the exact wording; stale consent refused", "Append-only audit trail, case history and outcome ledger", "No SOC 2 / ISO certification — none is claimed", "Real-money refunds are out of scope: reviews are opened, never refunds issued"].map((t) => (
            <li key={t} className="flex gap-2"><Check size={18} aria-hidden className="mt-0.5 shrink-0 text-success" />{t}</li>
          ))}
        </ul>
        <LinkButton href="/security" variant="secondary" className="mt-6">Read the security page</LinkButton>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-labelledby="faq">
        <h2 id="faq" className="t-h1">Questions</h2>
        <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {[
            ["Is this live with customers?", "No. It is an early build running on synthetic data. There are no customers, case studies or performance numbers on this site."],
            ["Does it issue refunds?", "No. It opens a billing review. A person decides, and refund processing happens in the provider's own billing system."],
            ["Does it replace our helpdesk or AI agent?", "No. It is the layer after the conversation: policy, consent, action and verification. A separate agent (for example one built on eGain) can call it."],
            ["What can it connect to today?", "A simulated subscription provider and an internal queue. Real billing and scheduling connectors are not built."],
          ].map(([q, a]) => (
            <details key={q} className="group px-5 py-4"><summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-4 font-medium">{q}<span aria-hidden className="text-muted group-open:rotate-45">+</span></summary><p className="mt-2 text-muted">{a}</p></details>
          ))}
        </div>
      </section>
    </>
  );
}
