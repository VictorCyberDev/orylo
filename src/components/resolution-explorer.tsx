"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { VerifiedSeal } from "./ui";

const stages = [
  { id: "detect", label: "Detect", title: "Find what really happened", body: "Jordan cancelled nine days ago and was charged again three days ago. Orylo finds the earlier request, reads the account, and sees the cancellation never reached billing.", facts: [["Earlier request", "Received 9 days ago, never applied"], ["Account", "Still active, billing on"], ["New charge", "$29.99, 3 days ago"]], state: "Investigating" },
  { id: "decide", label: "Decide", title: "Check what is allowed", body: "Approved, currently effective policy says an earlier cancellation can be honoured within 30 days, with the customer's confirmation. Policy text is quoted as a citation; only structured rules authorise anything.", facts: [["Authority", "Cancellation Policy v1, billing policy v2"], ["Needs", "Customer's explicit yes"], ["Refunds", "Never automatic — a review is opened instead"]], state: "Ready for action" },
  { id: "execute", label: "Execute", title: "Act once, with consent", body: "Jordan confirms the exact wording. The Action Gateway applies the cancellation once — even if the request is retried — and returns a signed receipt.", facts: [["Consent", "Stored with the exact wording shown"], ["Idempotency", "Retries replay, never repeat"], ["Receipt", "RCPT-… (verifiable)"]], state: "Action in progress" },
  { id: "verify", label: "Verify", title: "Say it only when it is true", body: "Orylo reads the account back. Cancellation: verified. Billing review: opened, no money has moved. The case is not 'resolved' until every objective is verified.", facts: [["Cancellation", "Verified by read-back"], ["Billing review", "Opened — pending a person's decision"], ["Case", "Partially resolved"]], state: "Verifying outcome" },
] as const;

export function ResolutionExplorer() {
  const [i, setI] = useState(0);
  const s = stages[i];
  return (
    <div className="rounded-lg border border-border bg-surface shadow-md">
      <div role="tablist" aria-label="Resolution stages" className="grid grid-cols-4 border-b border-border">
        {stages.map((st, idx) => (
          <button key={st.id} role="tab" id={`tab-${st.id}`} aria-selected={i === idx} aria-controls="stage-panel" tabIndex={i === idx ? 0 : -1}
            onClick={() => setI(idx)}
            onKeyDown={(e) => { if (e.key === "ArrowRight") setI((i + 1) % 4); if (e.key === "ArrowLeft") setI((i + 3) % 4); }}
            className={cn("min-h-12 px-2 text-sm font-medium transition-colors", i === idx ? "border-b-2 border-accent-text text-fg" : "text-muted hover:text-fg")}>
            <span className="t-num mr-1 text-subtle">{idx + 1}</span>{st.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="stage-panel" aria-labelledby={`tab-${s.id}`} className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-h2">{s.title}</h3>
          {s.id === "verify" ? <VerifiedSeal label="Verified by read-back" /> : null}
        </div>
        <p className="text-muted">{s.body}</p>
        <dl className="divide-y divide-border rounded-md border border-border text-sm">
          {s.facts.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2.5 sm:grid-cols-[10rem_1fr]"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <p className="t-caption">Case state: <strong className="font-medium text-fg">{s.state}</strong> · Illustration using the synthetic demo account. Run it for real in the <a className="underline" href="/demo">live demo</a>.</p>
      </div>
    </div>
  );
}
