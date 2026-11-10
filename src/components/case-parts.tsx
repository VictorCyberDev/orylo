import { Check, Clock, FileText, LifeBuoy, Mail, Phone, ShieldAlert } from "lucide-react";
import type { CaseView } from "@/domain/case-view";
import { brand } from "@/config/brand";
import { Alert, Badge, Card, CardHeader, EmptyState, Money, Progress, VerifiedSeal, When, objectiveLabel, objectiveTone, Field, inputClass, Button } from "./ui";
import { ActionForm, SubmitButton } from "./client";
import { confirmActionAction, escalateAction, feedbackAction, provideInfoAction, reopenAction, uploadEvidenceAction, cancelCaseAction } from "@/app/actions";

type Findings = Record<string, unknown> | null;

export function ObjectiveList({ view }: { view: CaseView }) {
  return (
    <Card aria-labelledby="obj-h">
      <CardHeader id="obj-h" title="What we're fixing" description={`${view.progress.verified} of ${view.progress.required} verified`} />
      <div className="space-y-4 p-5">
        <Progress value={view.progress.verified} max={Math.max(view.progress.required, 1)} label="Verified objectives" />
        <ul className="space-y-3">
          {view.objectives.map((o) => (
            <li key={o.key} className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium">{o.label}{!o.required ? <span className="t-caption"> (optional)</span> : null}</p>{o.detail ? <p className="t-caption mt-0.5">{o.detail}</p> : null}</div>
              <Badge tone={objectiveTone(o.status)} className="shrink-0">{o.status === "VERIFIED" ? <Check size={12} aria-hidden /> : null}{objectiveLabel(o.status)}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function KnowledgePanel({ view, audience }: { view: CaseView; audience: "customer" | "operator" }) {
  const f = (view.execution?.findings ?? null) as Findings;
  if (!f) return null;
  const rows: [string, string][] = [];
  if (f.accountFound === false) rows.push(["Your account", "We couldn't match an account to your details."]);
  else {
    rows.push(["Subscription", `${f.planName} (${f.accountNumber}) — ${String(f.accountStatus).toLowerCase()}, billing ${f.billingActive ? "on" : "off"}`]);
    rows.push(["Earlier cancellation request", f.priorCancellationFound ? `Found — received ${new Date(String(f.priorCancellationAt)).toISOString().slice(0, 10)} via ${String(f.priorCancellationChannel).replace("_", " ")}` : "None found"]);
    const dc = f.disputedCharge as { amountCents: number; chargedAt: string; description: string } | null;
    rows.push(["Charge in question", dc ? `${(dc.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} on ${dc.chargedAt.slice(0, 10)} — ${dc.description}` : "None found"]);
  }
  return (
    <Card aria-labelledby="know-h">
      <CardHeader id="know-h" title={audience === "customer" ? "What we know" : "Diagnosis"} description="Read from the subscription system just now." />
      <dl className="divide-y divide-border text-sm">{rows.map(([k, v]) => <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}</dl>
      {audience === "customer" ? <p className="border-t border-border px-5 py-3 t-caption"><strong className="font-medium text-fg">What we don&apos;t know:</strong> whether your bank has already processed anything, and what the billing team will decide. We won&apos;t guess at either.</p> : null}
    </Card>
  );
}

export function ActionCards({ view, caseRef }: { view: CaseView; caseRef: string }) {
  const open = view.actions.filter((a) => ["AWAITING_CONSENT", "AWAITING_APPROVAL", "APPROVED", "FAILED"].includes(a.status));
  if (!open.length) return null;
  return (
    <section aria-labelledby="act-h" className="space-y-3">
      <h2 id="act-h" className="t-h2">Needs your decision</h2>
      {open.map((a) => (
        <Card key={a.id} className="p-5" aria-label={a.label}>
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="t-h3">{a.label}</h3>{a.amountCents ? <Money cents={a.amountCents} /> : null}</div>
          {a.status === "AWAITING_CONSENT" || a.status === "APPROVED" ? (
            <>
              <blockquote className="mt-3 rounded-md border-l-4 border-accent-text bg-surface-2 px-4 py-3 text-sm">{a.consentText}</blockquote>
              <p className="t-caption mt-2">Saying yes records exactly this wording. You can say no — nothing will change.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionForm action={confirmActionAction}><input type="hidden" name="requestId" value={a.id} /><input type="hidden" name="caseRef" value={caseRef} /><input type="hidden" name="consent" value="yes" /><SubmitButton pendingLabel="Working…">Yes, go ahead</SubmitButton></ActionForm>
                <ActionForm action={confirmActionAction}><input type="hidden" name="requestId" value={a.id} /><input type="hidden" name="caseRef" value={caseRef} /><input type="hidden" name="consent" value="no" /><SubmitButton variant="secondary">No, don&apos;t do this</SubmitButton></ActionForm>
              </div>
            </>
          ) : null}
          {a.status === "AWAITING_APPROVAL" ? <div className="mt-3"><Alert tone="info" title="Waiting for a team member">You&apos;ve confirmed. Because of the amount, a team member must approve before anything happens. We&apos;ll notify you.</Alert></div> : null}
          {a.status === "FAILED" ? <div className="mt-3"><Alert tone="warning" title="This didn't go through">{a.failureMessage ?? "Something changed."} Nothing was reported as done. {a.status === "FAILED" ? "If the situation changed, we'll propose it again; otherwise ask for a person below." : ""}</Alert></div> : null}
        </Card>
      ))}
    </section>
  );
}

export function ReceiptsAndLedger({ view }: { view: CaseView }) {
  const entries = view.ledger as { seq: number; requestedOutcome: string; executionResult: string; finalOutcome: string; verifiedAt: Date | null; summary?: string | null; receiptRef?: string | null; verificationMethod?: string | null }[];
  return (
    <Card aria-labelledby="led-h">
      <CardHeader id="led-h" title="What has actually happened" description="Each entry is recorded when it happens and can't be edited." />
      {entries.length === 0 ? <EmptyState title="Nothing has been changed yet">When a step is carried out, its checked result appears here with a receipt.</EmptyState> : (
        <ol className="divide-y divide-border">
          {entries.map((e) => {
            const verified = e.finalOutcome === "VERIFIED" && !!e.verifiedAt;
            return (
              <li key={e.seq} className="flex gap-4 px-5 py-4">
                {verified ? <VerifiedSeal /> : <span aria-hidden className="mt-1 flex h-11 w-11 flex-none items-center justify-center rounded-full border border-warning/40 bg-warning-bg"><Clock size={18} className="text-warning" /></span>}
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{e.requestedOutcome}</p>
                  <p className="text-sm text-muted">{e.summary ?? (e.finalOutcome === "FAILED" ? "The attempt failed. Nothing is confirmed." : "")}</p>
                  <p className="t-caption">{verified ? <>Verified by read-back <When at={e.verifiedAt} /></> : e.finalOutcome === "FAILED" ? "Not completed" : "Not verified"}{e.receiptRef ? <> · Receipt <span className="t-code">{e.receiptRef}</span></> : null}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function Timeline({ view, audience }: { view: CaseView; audience: "customer" | "operator" }) {
  return (
    <Card aria-labelledby="tl-h">
      <CardHeader id="tl-h" title={audience === "customer" ? "Your case history" : "Audit timeline"} />
      <ol className="space-y-0 px-5 py-4">
        {[...view.events].reverse().map((e) => (
          <li key={e.seq} className="relative border-l border-border pb-5 pl-5 last:pb-0">
            <span aria-hidden className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-border-strong" />
            <p className="text-sm">{e.message ?? e.type}{e.visibility === "internal" ? <Badge className="ml-2">Internal</Badge> : null}</p>
            <p className="t-caption"><When at={e.at} /> · {e.actor}{audience === "operator" && e.fromState && e.toState ? <> · {e.fromState} → {e.toState}</> : null}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function HumanSupport({ caseRef, existing }: { caseRef: string; existing: CaseView["escalations"] }) {
  const open = existing.filter((e) => ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"].includes(e.status));
  return (
    <Card aria-labelledby="hs-h">
      <CardHeader id="hs-h" title="Talk to a person" description="Everything on this page goes with you — you won't repeat yourself." />
      <div className="space-y-4 p-5">
        {open.length ? (
          <ul className="space-y-2">{open.map((e) => <li key={e.id}><Alert tone="info" title={`Request ${e.status.toLowerCase().replace("_", " ")}`}>{"hasOwner" in e && e.hasOwner ? "A team member owns this and is working on it." : "Waiting for a team member to pick it up."} Opened <When at={e.createdAt} />.</Alert></li>)}</ul>
        ) : null}
        <div className="grid gap-4">
          {([["callback_request", "Request a callback", Phone, `Demonstration number: ${brand.demoContact.phone}`], ["email_request", "Email follow-up", Mail, `Demonstration address: ${brand.demoContact.email}`]] as const).map(([ch, label, Icon, hint]) => (
            <ActionForm key={ch} action={escalateAction} className="rounded-md border border-border p-4">
              <input type="hidden" name="caseRef" value={caseRef} /><input type="hidden" name="channel" value={ch} />
              <p className="flex items-center gap-2 font-medium"><Icon size={16} aria-hidden />{label}</p>
              <p className="t-caption mt-1 break-words">{hint}. This creates a tracked request in our team&apos;s queue. We can&apos;t promise live availability in this demo.</p>
              <Field id={`reason-${ch}`} label="Anything to add? (optional)"><input id={`reason-${ch}`} name="reason" className={`${inputClass} mt-2`} maxLength={300} /></Field>
              <div className="mt-3"><SubmitButton variant="secondary">{label}</SubmitButton></div>
            </ActionForm>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function InfoForm({ view, caseRef }: { view: CaseView; caseRef: string }) {
  const fields = view.execution?.collectFields ?? [];
  if (view.case.state !== "AWAITING_CUSTOMER_INFORMATION" || !fields.length) return null;
  const pending = new Set(view.execution?.pendingFields ?? []);
  return (
    <Card aria-labelledby="info-h">
      <CardHeader id="info-h" title="We need a few details" description="Only what's missing — nothing you've already told us." />
      <ActionForm action={provideInfoAction} className="space-y-4 p-5">
        <input type="hidden" name="caseRef" value={caseRef} />
        {fields.filter((f) => f.type !== "evidence" && pending.has(f.key)).map((f) => (
          <Field key={f.key} id={`f-${f.key}`} label={f.label} required={f.required}>
            {f.type === "choice" ? <select id={`f-${f.key}`} name={f.key} required className={inputClass}><option value="">Choose…</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : f.type === "text_list" ? <textarea id={`f-${f.key}`} name={f.key} rows={3} required className={inputClass} />
              : <input id={`f-${f.key}`} name={f.key} type={f.type === "date" ? "date" : "text"} required className={inputClass} />}
          </Field>
        ))}
        {pending.has("proof") ? <Alert tone="info" title="Proof of purchase still needed">Upload it using the evidence box on this page, then come back.</Alert> : null}
        <SubmitButton>Send details</SubmitButton>
      </ActionForm>
    </Card>
  );
}

export function EvidenceBox({ view, caseRef }: { view: CaseView; caseRef: string }) {
  return (
    <Card aria-labelledby="ev-h">
      <CardHeader id="ev-h" title="Evidence" description="PNG, JPEG, PDF or text · up to 2 MB" />
      <div className="space-y-4 p-5">
        {view.evidence.length ? <ul className="space-y-1.5 text-sm">{view.evidence.map((e) => <li key={e.id} className="flex items-center gap-2"><FileText size={16} aria-hidden /><a className="underline" href={`/api/evidence/${e.id}`}>{e.filename}</a><span className="t-caption">{Math.ceil(e.sizeBytes / 1024)} KB</span></li>)}</ul> : <p className="t-caption">Nothing uploaded yet.</p>}
        <ActionForm action={uploadEvidenceAction} className="space-y-3">
          <input type="hidden" name="caseRef" value={caseRef} />
          <Field id="file" label="Add a file"><input id="file" name="file" type="file" accept="image/png,image/jpeg,application/pdf,text/plain" required className={`${inputClass} py-2`} /></Field>
          <SubmitButton variant="secondary" pendingLabel="Uploading…">Upload</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}

export function ReopenOrFeedback({ view, caseRef }: { view: CaseView; caseRef: string }) {
  const st = view.case.state;
  if (st === "VERIFIED_RESOLVED")
    return (
      <Card aria-labelledby="fb-h">
        <CardHeader id="fb-h" title="Outcome verified" description="Every objective was checked against the source system." />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <ActionForm action={feedbackAction} className="space-y-3">
            <input type="hidden" name="caseRef" value={caseRef} />
            <Field id="rating" label="How was this?"><select id="rating" name="rating" className={inputClass} defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></Field>
            <Field id="comment" label="Anything to add? (optional)"><textarea id="comment" name="comment" rows={2} className={inputClass} maxLength={500} /></Field>
            <SubmitButton variant="secondary">Send feedback</SubmitButton>
          </ActionForm>
          <ActionForm action={reopenAction} className="space-y-3">
            <input type="hidden" name="caseRef" value={caseRef} />
            <Field id="reopen-reason" label="Didn't actually work?" hint="Reopen this case — your history stays."><textarea id="reopen-reason" name="reason" rows={2} required className={inputClass} placeholder="What didn't happen?" /></Field>
            <SubmitButton variant="secondary">Reopen case</SubmitButton>
          </ActionForm>
        </div>
      </Card>
    );
  if (st === "CANCELLED" || st === "FAILED")
    return (
      <Card className="p-5"><ActionForm action={reopenAction} className="space-y-3"><input type="hidden" name="caseRef" value={caseRef} /><Field id="reopen-reason" label="Reopen this case" hint="Your history stays — you won't start over."><textarea id="reopen-reason" name="reason" required rows={2} className={inputClass} /></Field><SubmitButton variant="secondary">Reopen</SubmitButton></ActionForm></Card>
    );
  if (!["REOPENED"].includes(st))
    return (
      <div className="flex justify-end"><ActionForm action={cancelCaseAction}><input type="hidden" name="caseRef" value={caseRef} /><SubmitButton variant="ghost" pendingLabel="Cancelling…">Cancel this case</SubmitButton></ActionForm></div>
    );
  return null;
}

export function StatusSummary({ view }: { view: CaseView }) {
  const s = view.case.state;
  const msg: Record<string, string> = {
    OPEN: "We've opened your case and are starting to look.",
    INVESTIGATING: "We're checking your account and earlier requests.",
    AWAITING_CUSTOMER_INFORMATION: "We need a few details from you to continue.",
    READY_FOR_ACTION: "We know what we can do. Review the steps below — nothing happens until you say yes.",
    AWAITING_APPROVAL: "A team member needs to approve a step before it can run.",
    ACTION_PENDING: "A step is being carried out.",
    ACTION_EXECUTED: "A step ran. We're checking the result before telling you it worked.",
    OUTCOME_PENDING_VERIFICATION: "Part of this is verified. The rest is waiting on a decision or a check — we won't call it resolved yet.",
    VERIFIED_RESOLVED: "Everything is done and verified.",
    BLOCKED: "We couldn't go further automatically. A person is being asked to help.",
    ESCALATED: "A person has your case with everything we know.",
    FAILED: "We couldn't complete this. You can reopen it or ask for a person.",
    CANCELLED: "This case was cancelled. You can reopen it.",
    REOPENED: "Reopened. Your history is intact; we're picking it back up.",
  };
  const tone = s === "VERIFIED_RESOLVED" ? "success" : s === "FAILED" || s === "BLOCKED" ? "danger" : s === "OUTCOME_PENDING_VERIFICATION" || s === "AWAITING_APPROVAL" || s === "ESCALATED" ? "warning" : "info";
  return (
    <Alert tone={tone} title={view.case.stateLabel}>
      <div className="flex items-start gap-3">{s === "VERIFIED_RESOLVED" ? <VerifiedSeal /> : s === "FAILED" || s === "BLOCKED" ? <ShieldAlert size={20} aria-hidden /> : <LifeBuoy size={20} aria-hidden className="shrink-0" />}<p>{msg[s]}</p></div>
    </Alert>
  );
}
export { Button };
