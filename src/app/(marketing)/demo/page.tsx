import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, LinkButton, SyntheticBadge } from "@/components/ui";
import { DEMO_PASSWORD } from "@/seed/world";
export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Run the failed-cancellation recovery journey as a customer and as an operator on synthetic data.",
  alternates: { canonical: "/demo" },
};

const demoOn = process.env.DEMO_MODE !== "false";
const people = [
  {
    who: "Jordan Reyes",
    role: "Customer",
    email: "jordan.reyes@customer.example",
    href: "/portal",
    note: "Cancelled 9 days ago, charged again 3 days ago. Both actions are available ($29.99).",
  },
  {
    who: "Priya Nair",
    role: "Customer",
    email: "priya.nair@customer.example",
    href: "/portal",
    note: "$149.00 charge — the billing review needs a team member's approval.",
  },
  {
    who: "Marcus Bell",
    role: "Customer",
    email: "marcus.bell@customer.example",
    href: "/portal",
    note: "Already cancelled but charged afterwards — review only.",
  },
  {
    who: "Elena Rossi",
    role: "Customer",
    email: "elena.rossi@customer.example",
    href: "/portal",
    note: "Never asked to cancel — no permitted automatic action; goes to a person.",
  },
  {
    who: "Ana Ortiz",
    role: "Operator",
    email: "ana@northfield.example",
    href: "/app",
    note: "Works cases, proposes and runs permitted actions, owns escalations.",
  },
  {
    who: "Ben Lindqvist",
    role: "Approver",
    email: "ben@northfield.example",
    href: "/app/approvals",
    note: "Approves higher-value reviews; approves policy and workflow changes.",
  },
  {
    who: "Olivia Park",
    role: "Owner",
    email: "owner@northfield.example",
    href: "/app/admin",
    note: "Admin: members, policies, workflows, keys, audit, billing (test mode).",
  },
];
export default function Demo() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-14 sm:px-6">
      <header className="space-y-3">
        <p className="t-label">Live demo</p>
        <h1 className="t-h1">Run it as the customer. Then watch it as the operator.</h1>
        <p className="text-muted">
          Everything below is fictional <SyntheticBadge />. Actions run against a simulated subscription
          provider and never move money.
        </p>
      </header>
      {!demoOn ? (
        <Alert tone="info" title="Demo credentials are switched off in this deployment">
          Set <code className="t-code">DEMO_MODE=true</code> to display them.{" "}
          <Link href="/contact" className="underline">
            Request access
          </Link>{" "}
          instead.
        </Alert>
      ) : (
        <>
          <Alert tone="info" title="Shared demo password">
            All demo users share <code className="t-code">{DEMO_PASSWORD}</code>. Seed with{" "}
            <code className="t-code">npm run db:seed</code>; reset any time with{" "}
            <code className="t-code">npm run demo:reset</code>.
          </Alert>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {people.map((p) => (
              <li key={p.email}>
                <Card className="flex h-full flex-col gap-2 p-5">
                  <p className="t-label">{p.role}</p>
                  <h2 className="t-h3">{p.who}</h2>
                  <p className="t-code text-muted">{p.email}</p>
                  <p className="text-sm text-muted">{p.note}</p>
                  <LinkButton
                    href={`/sign-in?next=${p.href}&email=${encodeURIComponent(p.email)}`}
                    variant="secondary"
                    size="sm"
                    className="mt-auto self-start"
                  >
                    Sign in as {p.who.split(" ")[0]}
                  </LinkButton>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      <section className="max-w-3xl space-y-2 text-sm text-muted">
        <h2 className="t-h3 text-fg">A 5-minute path</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Sign in as Jordan → Start a case → &ldquo;I cancelled but was charged again&rdquo;.</li>
          <li>
            Read what we found; confirm the cancellation. Watch it become <em>Verified</em> only after
            read-back.
          </li>
          <li>
            Confirm the billing review — the case is <em>partially resolved</em>, not done.
          </li>
          <li>
            Sign in as Ana → open the case → see the evidence, ledger and audit; record the billing
            team&apos;s decision.
          </li>
          <li>
            Jordan&apos;s case becomes <em>Verified resolved</em>.
          </li>
        </ol>
      </section>
    </div>
  );
}
