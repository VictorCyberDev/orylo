import Link from "next/link";
import type { CaseView } from "@/domain/case-view";
import { allowedTargets, STATE_LABEL } from "@/domain/case-machine";
import type { CaseState } from "@/db/schema";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  DataTable,
  Field,
  Money,
  Td,
  Th,
  When,
  inputClass,
  objectiveLabel,
  objectiveTone,
  VerifiedSeal,
  EmptyState,
} from "./ui";
import { ActionForm, SubmitButton, CopyButton, Modal } from "./client";
import {
  approvalAction,
  assignAction,
  issuePortalLinkAction,
  noteAction,
  operatorRunAction,
  priorityAction,
  takeEscalationAction,
  transitionAction,
  resolveEscalationAction,
  escalateAction,
  advanceAction,
} from "@/app/actions";
import { PortalLinkForm } from "./portal-link-form";

type Findings = {
  disputedCharge?: { id: string; amountCents: number } | null;
  accountNumber?: string;
} | null;

/** Explains the recommendation BEFORE offering buttons. */
export function Recommendation({ view, canAct }: { view: CaseView; canAct: boolean }) {
  const st = view.case.state;
  const f = (view.execution?.findings ?? null) as Findings;
  const awaitingConsent = view.actions.filter((a) => a.status === "AWAITING_CONSENT");
  const awaitingApproval = view.actions.filter((a) => a.status === "AWAITING_APPROVAL");
  let title = "No action needed right now";
  let why = "The workflow is running or waiting on the customer.";
  let tone: "info" | "warning" | "success" | "danger" = "info";
  if (awaitingApproval.length) {
    title = "Review and decide the pending approval";
    why = `The customer already confirmed. ${awaitingApproval[0].label} is for ${((awaitingApproval[0].amountCents ?? 0) / 100).toFixed(2)} USD, above the approval threshold. Nothing runs until a different team member decides.`;
    tone = "warning";
  } else if (st === "ESCALATED") {
    title = "Take ownership of the escalation";
    why =
      "Automation stopped safely. The escalation below holds a frozen snapshot of what was checked, tried and failed, so you don't need to ask the customer again.";
    tone = "warning";
  } else if (st === "BLOCKED" || st === "FAILED") {
    title = "Investigate the failure";
    why =
      "An action failed or a safe path was not found. See the attempts and ledger below; the customer has been told nothing was done.";
    tone = "danger";
  } else if (awaitingConsent.length) {
    title = "Waiting for the customer's confirmation";
    why = `${awaitingConsent.length} proposed step(s) need the customer's explicit yes. Staff can't consent on their behalf. You can send an approved case-access link.`;
  } else if (st === "OUTCOME_PENDING_VERIFICATION") {
    title = f?.disputedCharge ? "Record the billing team's decision" : "Waiting on an external decision";
    why =
      "Part of the case is verified. The remaining objective depends on a person's decision in the billing system. Orylo records the decision; it never moves money.";
    tone = "warning";
  } else if (st === "VERIFIED_RESOLVED") {
    title = "Resolved and verified";
    why = "Every required objective was read back from the source system and recorded in the ledger.";
    tone = "success";
  } else if (st === "AWAITING_CUSTOMER_INFORMATION") {
    title = "Waiting for the customer's details";
    why = "The workflow is paused on missing information.";
  }
  return (
    <Alert tone={tone} title={`Recommended: ${title}`}>
      <p>{why}</p>
      {!canAct ? <p className="mt-1 t-caption">Your role is read-only for this case.</p> : null}
    </Alert>
  );
}

export function ActionsTable({
  view,
  caseRef,
  canApprove,
}: {
  view: CaseView;
  caseRef: string;
  canApprove: boolean;
}) {
  type Row = (typeof view.actions)[number] & {
    approvals?: { type: string; decision: string; reason?: string | null }[];
    attempts?: { no: number; status: string; errorCode: string | null }[];
    externalRef?: string | null;
    failureCode?: string | null;
  };
  const rows = view.actions as Row[];
  return (
    <Card aria-labelledby="ac-h">
      <CardHeader
        id="ac-h"
        title="Actions"
        description="Typed operations passed through the Action Gateway"
      />
      {rows.length === 0 ? (
        <EmptyState title="No actions proposed yet" />
      ) : (
        <DataTable caption="Actions on this case">
          <thead>
            <tr>
              <Th>Operation</Th>
              <Th>Status</Th>
              <Th>Amount</Th>
              <Th>Consent / approval</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <span className="font-medium">{a.label}</span>
                  <div className="t-code text-muted">{a.operation}</div>
                  {a.receipt ? (
                    <div className="t-caption mt-1">
                      Receipt <span className="t-code">{a.receipt.receiptNo}</span>
                      {a.externalRef ? (
                        <>
                          {" "}
                          · ext <span className="t-code">{a.externalRef}</span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {(a.attempts ?? []).length ? (
                    <div className="t-caption">
                      Attempts:{" "}
                      {a
                        .attempts!.map((t) => `#${t.no} ${t.status}${t.errorCode ? ` (${t.errorCode})` : ""}`)
                        .join(", ")}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <Badge
                    tone={
                      a.status === "SUCCEEDED"
                        ? "success"
                        : a.status === "FAILED" || a.status === "DENIED"
                          ? "danger"
                          : a.status.startsWith("AWAITING")
                            ? "warning"
                            : "info"
                    }
                  >
                    {a.status.replace("_", " ")}
                  </Badge>
                  {a.failureCode ? <div className="t-caption mt-1">{a.failureCode}</div> : null}
                </Td>
                <Td>
                  <Money cents={a.amountCents} />
                </Td>
                <Td className="text-xs">
                  {(a.approvals ?? []).length
                    ? a.approvals!.map((p, i) => (
                        <div key={i}>
                          {p.type === "customer" ? "Customer" : "Staff"}: {p.decision.toLowerCase()}
                          {p.reason ? ` (${p.reason})` : ""}
                        </div>
                      ))
                    : "—"}
                  {a.status === "AWAITING_APPROVAL" && canApprove ? (
                    <ActionForm action={approvalAction} className="mt-2 space-y-2">
                      <input type="hidden" name="requestId" value={a.id} />
                      <input type="hidden" name="caseRef" value={caseRef} />
                      <label className="sr-only" htmlFor={`r-${a.id}`}>
                        Reason
                      </label>
                      <input
                        id={`r-${a.id}`}
                        name="reason"
                        placeholder="Reason (optional)"
                        className={`${inputClass} min-h-9 text-sm`}
                      />
                      <div className="flex gap-2">
                        <button
                          name="decision"
                          value="approve"
                          className="min-h-9 rounded-md bg-primary px-3 text-sm text-primary-fg"
                        >
                          Approve
                        </button>
                        <button
                          name="decision"
                          value="decline"
                          className="min-h-9 rounded-md border border-border-strong px-3 text-sm"
                        >
                          Decline
                        </button>
                      </div>
                    </ActionForm>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}

export function OperatorLedger({ view }: { view: CaseView }) {
  const rows = view.ledger as {
    seq: number;
    objectiveKey: string | null;
    requestedOutcome: string;
    actionAttempted: string | null;
    executor: string;
    authorizationRef: string | null;
    externalOperationRef: string | null;
    executionResult: string;
    verificationMethod: string | null;
    verifiedAt: Date | null;
    finalOutcome: string;
    remainingObjectives: string[];
    entryHash: string;
    evidence: Record<string, unknown>;
  }[];
  return (
    <Card aria-labelledby="ol-h">
      <CardHeader id="ol-h" title="Outcome ledger" description="Append-only, hash-chained per organization" />
      {rows.length === 0 ? (
        <EmptyState title="No ledger entries yet" />
      ) : (
        <ol className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.seq} className="space-y-1 px-5 py-4 text-sm">
              <div className="flex items-start gap-3">
                {r.finalOutcome === "VERIFIED" ? <VerifiedSeal /> : null}
                <div className="min-w-0">
                  <p className="font-medium">
                    #{r.seq} {r.requestedOutcome}{" "}
                    <Badge
                      tone={
                        r.finalOutcome === "VERIFIED"
                          ? "success"
                          : r.finalOutcome === "FAILED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {r.finalOutcome}
                    </Badge>
                  </p>
                  <p className="t-caption">
                    Result {r.executionResult} · method {r.verificationMethod ?? "—"} · executor {r.executor}{" "}
                    · auth {r.authorizationRef ?? "—"}
                  </p>
                  <p className="t-caption">
                    External ref {r.externalOperationRef ?? "—"} · remaining:{" "}
                    {r.remainingObjectives.join(", ") || "none"}
                  </p>
                  <p className="t-code truncate text-subtle" title={r.entryHash}>
                    hash {r.entryHash.slice(0, 24)}…
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs underline">Evidence</summary>
                    <pre className="t-code mt-1 overflow-x-auto rounded bg-surface-2 p-2">
                      {JSON.stringify(r.evidence, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function CaseControls({
  view,
  staff,
  members,
}: {
  view: CaseView;
  staff: { canWrite: boolean; canAssign: boolean; canNote: boolean };
  members: { userId: string; name: string }[];
}) {
  const c = view.case;
  const targets = allowedTargets(c.state as CaseState, "operator");
  return (
    <Card aria-labelledby="ctl-h">
      <CardHeader id="ctl-h" title="Case controls" />
      <div className="space-y-5 p-5">
        {staff.canWrite ? (
          <ActionForm action={transitionAction} className="space-y-2">
            <input type="hidden" name="caseRef" value={c.reference} />
            <input type="hidden" name="version" value={c.version} />
            <Field
              id="to"
              label="Move to state"
              hint="Only transitions legal for staff from the current state are offered."
            >
              <select id="to" name="to" className={inputClass} required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {targets.map((t) => (
                  <option key={t} value={t}>
                    {STATE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="tmsg" label="Note for the history (optional)">
              <input id="tmsg" name="message" className={inputClass} maxLength={300} />
            </Field>
            <SubmitButton variant="secondary" disabled={targets.length === 0}>
              Update state
            </SubmitButton>
            {targets.length === 0 ? <p className="t-caption">No staff transitions from this state.</p> : null}
          </ActionForm>
        ) : null}
        {staff.canAssign ? (
          <div className="grid gap-5">
            <ActionForm action={assignAction} className="space-y-2">
              <input type="hidden" name="caseId" value={c.id} />
              <Field id="assignee" label="Assignee">
                <select
                  id="assignee"
                  name="assignee"
                  defaultValue={c.assigneeUserId ?? ""}
                  className={inputClass}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <SubmitButton variant="secondary">Assign</SubmitButton>
            </ActionForm>
            <ActionForm action={priorityAction} className="space-y-2">
              <input type="hidden" name="caseId" value={c.id} />
              <Field id="priority" label="Priority">
                <select id="priority" name="priority" defaultValue={c.priority} className={inputClass}>
                  {["low", "normal", "high", "urgent"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <SubmitButton variant="secondary">Set priority</SubmitButton>
            </ActionForm>
          </div>
        ) : null}
        {staff.canNote ? (
          <ActionForm action={noteAction} className="space-y-2">
            <input type="hidden" name="caseId" value={c.id} />
            <Field id="note" label="Add a note">
              <textarea id="note" name="message" rows={2} className={inputClass} required maxLength={2000} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <select name="visibility" aria-label="Note visibility" className={`${inputClass} w-auto`}>
                <option value="internal">Internal only</option>
                <option value="customer">Visible to customer</option>
              </select>
              <SubmitButton variant="secondary">Add note</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </div>
    </Card>
  );
}

export function StaffOps({ view, caseRef }: { view: CaseView; caseRef: string }) {
  const f = (view.execution?.findings ?? null) as Findings;
  const reviewDone = view.objectives.find((o) => o.key === "billing_review_submitted")?.status === "VERIFIED";
  const dispo = view.objectives.find((o) => o.key === "charge_disposition");
  const slot = view.objectives.find((o) => o.key === "new_appointment_confirmed");
  const showDecision =
    reviewDone && dispo && dispo.status !== "VERIFIED" && f?.disputedCharge && f.accountNumber;
  const showSlot =
    slot &&
    slot.status !== "VERIFIED" &&
    view.objectives.find((o) => o.key === "reschedule_requested")?.status === "VERIFIED";
  if (!showDecision && !showSlot) return null;
  return (
    <Card aria-labelledby="ops-h">
      <CardHeader
        id="ops-h"
        title="Staff steps"
        description="Run through the Action Gateway: authorised, audited, verified by read-back."
      />
      <div className="space-y-5 p-5">
        {showDecision ? (
          <ActionForm action={operatorRunAction} className="space-y-3">
            <input type="hidden" name="caseId" value={view.case.id} />
            <input type="hidden" name="operation" value="billing.record_review_decision" />
            <Field
              id="decision"
              label="Billing team's decision"
              hint="Recorded only. Orylo never refunds; refund processing happens in the billing system."
            >
              <select
                id="decision"
                className={inputClass}
                onChange={undefined}
                name="decisionUi"
                defaultValue="APPROVED_FOR_REFUND_PROCESSING"
              >
                <option value="APPROVED_FOR_REFUND_PROCESSING">Approved for refund processing</option>
                <option value="DENIED">Denied</option>
              </select>
            </Field>
            <DecisionInput accountNumber={f!.accountNumber!} chargeId={f!.disputedCharge!.id} />
            <SubmitButton>Record decision</SubmitButton>
          </ActionForm>
        ) : null}
        {showSlot ? (
          <ActionForm action={operatorRunAction} className="space-y-3">
            <input type="hidden" name="caseId" value={view.case.id} />
            <input type="hidden" name="operation" value="internal.confirm_reschedule" />
            <Field
              id="slot"
              label="Confirmed new appointment"
              hint="Human-confirmed. No external scheduling system is connected."
            >
              <input
                id="slot"
                name="slotUi"
                className={inputClass}
                placeholder="e.g. Thu 19 Nov, 15:00–17:00"
                required
              />
            </Field>
            <SlotInput />
            <SubmitButton>Record confirmed slot</SubmitButton>
          </ActionForm>
        ) : null}
      </div>
      <p className="sr-only">{caseRef}</p>
    </Card>
  );
}
// Client helpers assemble the typed JSON `input` from the visible fields at submit time.
import { DecisionInput, SlotInput } from "./staff-inputs";

export function EscalationsBlock({ view, canManage }: { view: CaseView; canManage: boolean }) {
  const esc = view.escalations as {
    id: string;
    status: string;
    channel: string;
    queue: string | null;
    createdAt: Date;
    reason?: string;
    reasonCode?: string;
    ownerUserId?: string | null;
    contextSnapshot?: Record<string, unknown>;
    resolutionNote?: string | null;
  }[];
  if (!esc.length) return null;
  return (
    <Card aria-labelledby="es-h">
      <CardHeader
        id="es-h"
        title="Escalations"
        description="Real records with a queue, owner and frozen context"
      />
      <ul className="divide-y divide-border">
        {esc.map((e) => (
          <li key={e.id} className="space-y-2 px-5 py-4 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <Badge tone={["RESOLVED", "RETURNED_TO_AUTOMATION"].includes(e.status) ? "success" : "warning"}>
                {e.status.replace("_", " ")}
              </Badge>{" "}
              {e.channel.replace("_", " ")} · {e.queue ?? "no queue"} ·{" "}
              <span className="t-caption">
                <When at={e.createdAt} />
              </span>
            </p>
            <p>{e.reason}</p>
            <p className="t-caption">
              Code {e.reasonCode} · owner {e.ownerUserId ? e.ownerUserId.slice(0, 12) : "unassigned"}
            </p>
            {e.contextSnapshot ? (
              <details>
                <summary className="cursor-pointer text-xs underline">
                  Context snapshot (what was known)
                </summary>
                <pre className="t-code mt-1 max-h-64 overflow-auto rounded bg-surface-2 p-2">
                  {JSON.stringify(e.contextSnapshot, null, 2)}
                </pre>
              </details>
            ) : null}
            {e.resolutionNote ? <p className="t-caption">Resolution: {e.resolutionNote}</p> : null}
            {canManage && ["OPEN", "ACKNOWLEDGED"].includes(e.status) ? (
              <ActionForm action={takeEscalationAction}>
                <input type="hidden" name="id" value={e.id} />
                <SubmitButton>Take ownership</SubmitButton>
              </ActionForm>
            ) : null}
            {canManage && e.status === "IN_PROGRESS" ? (
              <ActionForm action={resolveEscalationAction} className="space-y-2">
                <input type="hidden" name="id" value={e.id} />
                <Field id={`n-${e.id}`} label="What was done?">
                  <input id={`n-${e.id}`} name="note" className={inputClass} required />
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="returnToAutomation" className="h-5 w-5" /> Return control to
                  the automated workflow
                </label>
                <SubmitButton variant="secondary">Close escalation</SubmitButton>
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function EscalateButton({ caseRef }: { caseRef: string }) {
  return (
    <Modal
      trigger={
        <button
          type="button"
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-sm hover:bg-surface-2"
        >
          Escalate…
        </button>
      }
      title="Escalate to a person"
      description="Creates a tracked escalation with a context snapshot and moves the case to Escalated."
    >
      <ActionForm action={escalateAction} className="space-y-3">
        <input type="hidden" name="caseRef" value={caseRef} />
        <input type="hidden" name="channel" value="queue" />
        <Field id="esc-reason" label="Reason" required>
          <textarea id="esc-reason" name="reason" rows={3} className={inputClass} required />
        </Field>
        <SubmitButton>Escalate</SubmitButton>
      </ActionForm>
    </Modal>
  );
}
export {
  PortalLinkForm,
  CopyButton,
  objectiveLabel,
  objectiveTone,
  Link,
  advanceAction,
  issuePortalLinkAction,
};
