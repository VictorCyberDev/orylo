import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, LinkButton, SyntheticBadge } from "@/components/ui";
import { EgainLaunchButton } from "@/components/egain-chat";
import { ReceiptCheck, ReviewerAccess } from "@/components/demo-widgets";
import { getEgainConfig } from "@/config/egain";
import { getEgainStatus } from "@/config/egain-status";
import { demoPeople } from "@/config/demo-people";
import { DEMO_PASSWORD } from "@/seed/world";

export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Talk to the eGain AI Agent about a failed cancellation and a repeat charge, then see what Orylo actually changed — and verified — behind it.",
  alternates: { canonical: "/demo" },
};

export const dynamic = "force-dynamic"; // read env at request time, never baked in at build
const demoOn = () => process.env.DEMO_MODE === "true";

export default function Demo() {
  const eg = getEgainConfig();
  const st = getEgainStatus();
  const clientCfg = {
    enabled: eg.enabled,
    agentId: eg.agentId,
    serverUrl: eg.serverUrl,
    scriptUrl: eg.scriptUrl,
  };
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-14 sm:px-6">
      <header className="space-y-4">
        <p className="t-label">Live demo</p>
        <h1 className="t-h1 max-w-3xl">
          A conversation isn&apos;t a resolution. See what happens after &ldquo;yes&rdquo;.
        </h1>
        <p className="max-w-2xl text-muted">
          Jordan cancelled a subscription nine days ago and was charged again three days ago. Talk to the AI
          agent about it, then look behind the answer: what was found, what was changed, and what was only{" "}
          <em>checked</em>. Everything here is fictional <SyntheticBadge />; no money ever moves.
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="agent-h">
        <h2 id="agent-h" className="t-h2">
          1 · Talk to the agent
        </h2>
        <Card className="space-y-4 p-6">
          <p className="max-w-2xl text-sm">
            This is the <strong>eGain AI Agent</strong>, embedded exactly as eGain provides it. Orylo does not
            imitate or replace it. Try:{" "}
            <em>&ldquo;I cancelled my subscription but I was charged again.&rdquo;</em>
          </p>
          <EgainLaunchButton config={clientCfg} />
          <div className="rounded-md border border-border p-4 text-sm">
            <h3 className="t-h3 mb-2">What is verified about this agent today</h3>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
              <dt className="font-medium">Chat widget</dt>
              <dd className="text-muted">
                Loads from eGain&apos;s servers under Orylo&apos;s content-security policy.
              </dd>
              <dt className="font-medium">Policy knowledge</dt>
              <dd className="text-muted">
                {st.knowledgeVerified
                  ? "Answers were checked against the Northfield policy documents."
                  : `Not yet confirmed (checked ${st.checkedOn}). The agent may not answer billing-policy questions until its knowledge is corrected in eGain.`}
              </dd>
              <dt className="font-medium">Actions on accounts</dt>
              <dd className="text-muted">
                {st.actionsLive
                  ? "The agent calls Orylo to change the account; each change is read back and receipted."
                  : "Not connected from the agent. The corrected cancellation and billing review are performed in the Orylo portal below — the same governed action path the agent will call."}
              </dd>
            </dl>
          </div>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="flow-h">
        <h2 id="flow-h" className="t-h2">
          2 · What a good resolution looks like
        </h2>
        <ol className="grid gap-4 md:grid-cols-2">
          {[
            ["Find", "The earlier cancellation request is located; the account is read. Nothing is assumed."],
            [
              "Explain",
              "The permitted fix is stated in plain words, with the exact wording the customer is agreeing to.",
            ],
            ["Consent", "Nothing changes until the customer says yes. A person approves anything above $50."],
            ["Verify", "After the change, the account is read again. Only then is it called done."],
          ].map(([t, d], i) => (
            <li key={t}>
              <Card className="h-full space-y-1 p-5">
                <p className="t-label">Step {i + 1}</p>
                <h3 className="t-h3">{t}</h3>
                <p className="text-sm text-muted">{d}</p>
              </Card>
            </li>
          ))}
        </ol>
        <Alert tone="warning" title="Two different outcomes — never blurred">
          <strong>Corrected cancellation</strong>: verified by reading the account back, with a signed
          receipt. <strong>Billing review</strong>: opened and tracked — <em>pending</em>. It is not a refund,
          and no money has moved until a person decides.
        </Alert>
      </section>

      <section className="space-y-4" aria-labelledby="proof-h">
        <h2 id="proof-h" className="t-h2">
          3 · Check a receipt yourself
        </h2>
        <p className="max-w-2xl text-sm text-muted">
          Every executed action issues a signed receipt. Anyone holding a receipt number can confirm it is
          genuine; the check reveals nothing about the customer.
        </p>
        <ReceiptCheck />
      </section>

      {demoOn() ? (
        <section className="space-y-4" aria-labelledby="local-h">
          <h2 id="local-h" className="t-h2">
            Local demo accounts
          </h2>
          <Alert tone="info" title="DEMO_MODE is on in this deployment">
            All demo users share <code className="t-code">{DEMO_PASSWORD}</code>. Turn DEMO_MODE off on any
            public deployment and use the reviewer code instead.
          </Alert>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {demoPeople.map((p) => (
              <li key={p.email}>
                <Card className="flex h-full flex-col gap-2 p-5">
                  <p className="t-label">{p.role}</p>
                  <h3 className="t-h3">{p.who}</h3>
                  <p className="t-code break-all text-muted">{p.email}</p>
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
        </section>
      ) : process.env.REVIEWER_ACCESS_CODE ? (
        <ReviewerAccess people={demoPeople} />
      ) : (
        <Alert tone="info" title="Reviewer sign-in is not enabled in this deployment">
          <Link href="/contact" className="underline">
            Ask the owner
          </Link>{" "}
          for access to the portal and operator console.
        </Alert>
      )}
    </div>
  );
}
