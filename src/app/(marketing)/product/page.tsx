import type { Metadata } from "next";
import { LinkButton, Card } from "@/components/ui";
import { ResolutionExplorer } from "@/components/resolution-explorer";
export const metadata: Metadata = { title: "Product", description: "Detect, Decide, Execute, Verify: how Orylo turns a failed customer operation into a verified outcome.", alternates: { canonical: "/product" } };
const parts = [
  ["Case state machine", "Fourteen explicit states with legal transitions per actor. A case can enter VERIFIED_RESOLVED only through verified ledger evidence — enforced by a database trigger, not just application code."],
  ["Objectives, not a boolean", "Each case tracks independent objectives (cancellation applied, billing review opened, review decided). Partial resolution is a first-class, visible state."],
  ["Policy & knowledge", "Versioned documents with owners, effective dates, review and approval (author ≠ approver). Contradictions and superseded versions can never authorise an action. Text that looks like instructions to an AI is quarantined."],
  ["Workflow engine", "Typed, versioned workflows with decision, consent, approval, verification, retry, timeout and escalation nodes. Every step execution is persisted."],
  ["Action Gateway", "Validates input, scope, role, policy currency, consent and current state; idempotency keys; recorded attempts; timeout-safe retries; signed receipts."],
  ["Outcome Ledger", "Append-only, hash-chained evidence of what was attempted, by whom, under which policy version, how it was verified, and what remains."],
  ["Human escalation", "A real record with a queue, owner, status and a frozen snapshot of everything known — so the customer never repeats themselves."],
];
export default function Product() {
  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-14 sm:px-6">
      <header className="max-w-3xl space-y-4"><p className="t-label">Product</p><h1 className="t-display">From &ldquo;we raised a ticket&rdquo; to &ldquo;it&apos;s done, and we checked&rdquo;.</h1><p className="t-body-lg">One loop, applied to every exception: detect, decide, execute, verify.</p></header>
      <ResolutionExplorer />
      <section aria-labelledby="parts"><h2 id="parts" className="t-h1 mb-6">What&apos;s built</h2>
        <div className="grid gap-4 md:grid-cols-2">{parts.map(([t, d]) => <Card key={t} className="p-5"><h3 className="t-h3">{t}</h3><p className="mt-1.5 text-sm text-muted">{d}</p></Card>)}</div>
      </section>
      <section className="rounded-lg border border-border bg-surface-2 p-6">
        <h2 className="t-h2">Where it fits</h2>
        <p className="mt-2 max-w-3xl text-muted">Orylo does not replace your helpdesk or your AI agent. A customer-facing agent — including one built on eGain — can call Orylo&apos;s action API for the governed part: consent, the change itself, and the verified result. Orylo&apos;s definition of a billable outcome (a <em>verified customer outcome</em>) is deliberately different from a conversation counted as resolved.</p>
        <div className="mt-4 flex gap-3"><LinkButton href="/demo">Run the demo</LinkButton><LinkButton href="/solutions" variant="secondary">See solutions</LinkButton></div>
      </section>
    </div>
  );
}
