"use client";
import { useActionState, useState } from "react";
import { revealReviewerAccessAction } from "@/app/actions";
import { SubmitButton } from "./client";
import { Alert, Field, inputClass, LinkButton, Card } from "./ui";
import type { DemoPerson } from "@/config/demo-people";

type State = { ok: boolean; error?: string; password?: string; message?: string };

/** Reviewer access: a code the owner shares privately. Without it, no credential appears anywhere on the public site. */
export function ReviewerAccess({ people }: { people: DemoPerson[] }) {
  const [s, action] = useActionState(
    revealReviewerAccessAction as (p: State, f: FormData) => Promise<State>,
    {
      ok: false,
    } as State,
  );
  return (
    <section className="space-y-4" aria-labelledby="rev-h">
      <h2 id="rev-h" className="t-h2">
        Inspect the system behind the answer
      </h2>
      <p className="max-w-2xl text-sm text-muted">
        The customer portal, operator console and audit trail are real and run on synthetic data. Reviewers
        get sign-in details with a code from the entry&apos;s owner — nothing is published on this page.
      </p>
      {s.ok && s.password ? (
        <div className="space-y-4">
          <Alert tone="info" title="Synthetic accounts — one shared password">
            <span className="t-code">{s.password}</span>. These identities and the data behind them are
            fictional.
          </Alert>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {people.map((p) => (
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
        </div>
      ) : (
        <form action={action} className="max-w-sm space-y-3">
          <Field id="reviewer-code" label="Reviewer code" hint="Provided privately by the entry's owner.">
            <input
              id="reviewer-code"
              name="code"
              autoComplete="off"
              spellCheck={false}
              required
              className={inputClass}
            />
          </Field>
          <SubmitButton variant="secondary">Show reviewer sign-in details</SubmitButton>
          {s.error ? <Alert tone="danger">{s.error}</Alert> : null}
        </form>
      )}
    </section>
  );
}

/** Public, safe: confirms a receipt number is genuine and returns nothing about the customer or case. */
export function ReceiptCheck() {
  const [no, setNo] = useState("");
  const [res, setRes] = useState<null | {
    valid: boolean;
    operation?: string;
    issuedAt?: string;
    err?: string;
  }>(null);
  const [busy, setBusy] = useState(false);
  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/receipts/${encodeURIComponent(no.trim())}/verify`);
      const j = (await r.json().catch(() => ({}))) as {
        valid?: boolean;
        receipt?: { operation: string; issuedAt: string };
      };
      setRes(
        r.ok && j.valid
          ? { valid: true, operation: j.receipt?.operation, issuedAt: j.receipt?.issuedAt }
          : { valid: false },
      );
    } catch {
      setRes({ valid: false, err: "Couldn't reach the verifier. Try again." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={check} className="max-w-md space-y-3" aria-label="Verify a receipt">
      <Field id="receipt-no" label="Receipt number" hint="Looks like RCPT-20261111-0123456789ABCDEF">
        <input
          id="receipt-no"
          value={no}
          onChange={(e) => setNo(e.target.value)}
          required
          spellCheck={false}
          className={inputClass}
        />
      </Field>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-md border border-border-strong px-4 text-sm font-medium disabled:opacity-60"
      >
        {busy ? "Checking…" : "Verify receipt"}
      </button>
      <div role="status" aria-live="polite">
        {res?.valid ? (
          <Alert tone="success" title="Genuine receipt">
            Operation <span className="t-code">{res.operation}</span>, issued{" "}
            {res.issuedAt ? new Date(res.issuedAt).toUTCString() : ""}. Signature checked against Orylo&apos;s
            signing key.
          </Alert>
        ) : res ? (
          <Alert tone="danger" title="Not a valid receipt">
            {res.err ?? "No receipt with that number and signature exists."}
          </Alert>
        ) : null}
      </div>
    </form>
  );
}
