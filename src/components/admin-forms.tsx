"use client";
import { useActionState } from "react";
import {
  createKeyAction,
  inviteAction,
  policyQuestionAction,
  simModeAction,
  updateOrgAction,
  workflowSaveAction,
  policyDraftAction,
  changePlanAction,
} from "@/app/actions";
import { ActionForm, CopyButton, SubmitButton } from "./client";
import { Alert, Field, inputClass, Badge } from "./ui";
import type { PolicyAnswer } from "@/domain/policy";
import type { SimMode } from "@/adapters/subscription";

export function InviteForm({ roles }: { roles: string[] }) {
  const [s, a] = useActionState(inviteAction, { ok: false } as {
    ok: boolean;
    link?: string;
    error?: string;
    message?: string;
  });
  const full = s.link && typeof window !== "undefined" ? `${window.location.origin}${s.link}` : s.link;
  return (
    <form action={a} className="space-y-3">
      <Field id="inv-email" label="Email" required>
        <input id="inv-email" name="email" type="email" required className={inputClass} />
      </Field>
      <Field id="inv-role" label="Role">
        <select id="inv-role" name="role" className={inputClass} defaultValue="operator">
          {roles.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton>Create invitation</SubmitButton>
      {s.error ? <Alert tone="danger">{s.error}</Alert> : null}
      {full ? (
        <Alert tone="success" title="Copy this link now — it's shown once">
          <p className="t-code mb-2 break-all">{full}</p>
          <CopyButton value={full} label="Copy link" />
          <p className="t-caption mt-2">No email is sent (no provider configured). Expires in 72 hours.</p>
        </Alert>
      ) : null}
    </form>
  );
}
export function KeyForm() {
  const [s, a] = useActionState(createKeyAction, { ok: false } as {
    ok: boolean;
    secret?: string;
    error?: string;
  });
  return (
    <form action={a} className="space-y-3">
      <Field id="k-name" label="Name">
        <input
          id="k-name"
          name="name"
          className={inputClass}
          placeholder="eGain agent (demo)"
          required
          maxLength={80}
        />
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Scopes</legend>
        {[
          ["egain:actions", "eGain action API (sessions, confirm, escalate)"],
          ["cases:read", "Read case status"],
        ].map(([v, l]) => (
          <label key={v} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="scopes"
              value={v}
              defaultChecked={v === "egain:actions"}
              className="h-5 w-5"
            />{" "}
            <span>
              <span className="t-code">{v}</span> — {l}
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton>Create key</SubmitButton>
      {s.error ? <Alert tone="danger">{s.error}</Alert> : null}
      {s.secret ? (
        <Alert tone="success" title="Copy the key now — it cannot be shown again">
          <p className="t-code mb-2 break-all">{s.secret}</p>
          <CopyButton value={s.secret} label="Copy key" />
          <p className="t-caption mt-2">
            Store it in eGain&apos;s secret/connector store. Never put it in knowledge content or chat.
          </p>
        </Alert>
      ) : null}
    </form>
  );
}
export function PolicyTester() {
  const [s, a] = useActionState(policyQuestionAction, { ok: false } as {
    ok: boolean;
    answer?: unknown;
    error?: string;
  });
  const ans = s.answer as PolicyAnswer | undefined;
  return (
    <form action={a} className="space-y-3">
      <Field
        id="pq"
        label="Test a customer question"
        hint="Answers come only from approved, currently effective policy — never generated."
      >
        <input
          id="pq"
          name="q"
          className={inputClass}
          placeholder="How do I cancel? · Can you give legal advice?"
          required
        />
      </Field>
      <SubmitButton variant="secondary">Ask</SubmitButton>
      {ans ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm" role="status">
          <Badge
            tone={ans.status === "ANSWERED" ? "success" : ans.status === "CONFLICT" ? "danger" : "warning"}
          >
            {ans.status}
          </Badge>
          <p>{ans.status === "ANSWERED" ? ans.answer : ans.message}</p>
          {ans.citations.map((c) => (
            <p key={c.versionId + c.section} className="t-caption">
              Source: {c.title} v{c.version} — “{c.section}” · {c.sourceLabel}
            </p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
export function SimModeForm({ mode, delayMs }: { mode: SimMode; delayMs: number }) {
  return (
    <ActionForm action={simModeAction} className="space-y-3">
      <Field id="mode" label="Simulator mode" hint="Used to prove failure handling. Normal for real demos.">
        <select id="mode" name="mode" defaultValue={mode} className={inputClass}>
          {(["normal", "failure", "delay", "duplicate", "stale_state", "auth_denied"] as const).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field id="delay" label="Delay (ms) for delay mode">
        <input
          id="delay"
          name="delayMs"
          type="number"
          defaultValue={delayMs}
          min={0}
          max={5000}
          className={inputClass}
        />
      </Field>
      <SubmitButton variant="secondary">Save mode</SubmitButton>
    </ActionForm>
  );
}
export function OrgForm({
  org,
}: {
  org: {
    name: string;
    branding: { displayName?: string; accent?: string; supportEmail?: string };
    settings: {
      retentionDays: number;
      approvalThresholdCents: number;
      emailNotifications: boolean;
      auditRetentionDays: number;
    };
  };
}) {
  return (
    <ActionForm action={updateOrgAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id="o-name" label="Organization name">
        <input id="o-name" name="name" defaultValue={org.name} className={inputClass} required />
      </Field>
      <Field id="o-dn" label="Display name (customer-facing)" hint="Requires a plan with custom branding.">
        <input id="o-dn" name="displayName" defaultValue={org.branding.displayName} className={inputClass} />
      </Field>
      <Field id="o-ac" label="Accent colour" hint="Hex, e.g. #0b6b57 · requires custom branding">
        <input
          id="o-ac"
          name="accent"
          defaultValue={org.branding.accent}
          pattern="#[0-9a-fA-F]{6}"
          className={inputClass}
        />
      </Field>
      <Field id="o-se" label="Support email">
        <input
          id="o-se"
          name="supportEmail"
          type="email"
          defaultValue={org.branding.supportEmail}
          className={inputClass}
        />
      </Field>
      <Field
        id="o-ap"
        label="Approval threshold (USD)"
        hint="Billing reviews above this need a team member's approval. Policy may set it lower."
      >
        <input
          id="o-ap"
          name="approvalThreshold"
          type="number"
          step="0.01"
          min={0}
          defaultValue={(org.settings.approvalThresholdCents / 100).toFixed(2)}
          className={inputClass}
        />
      </Field>
      <Field id="o-rt" label="Case retention (days)">
        <input
          id="o-rt"
          name="retentionDays"
          type="number"
          min={30}
          defaultValue={org.settings.retentionDays}
          className={inputClass}
        />
      </Field>
      <Field id="o-ar" label="Audit retention (days)">
        <input
          id="o-ar"
          name="auditRetentionDays"
          type="number"
          min={90}
          defaultValue={org.settings.auditRetentionDays}
          className={inputClass}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 self-end">
        <input
          type="checkbox"
          name="emailNotifications"
          defaultChecked={org.settings.emailNotifications}
          className="h-5 w-5"
        />{" "}
        Email notifications (recorded as skipped without a provider)
      </label>
      <div className="sm:col-span-2">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
export function PolicyDraftForm({ docs }: { docs: { key: string; title: string }[] }) {
  return (
    <ActionForm action={policyDraftAction} className="space-y-3">
      <Field
        id="pd-doc"
        label="Document key"
        hint="Existing key creates the next version; a new key creates a document (title required)."
      >
        <input
          id="pd-doc"
          name="documentKey"
          list="pd-keys"
          className={inputClass}
          required
          placeholder="billing-policy"
        />
      </Field>
      <datalist id="pd-keys">
        {docs.map((d) => (
          <option key={d.key} value={d.key}>
            {d.title}
          </option>
        ))}
      </datalist>
      <Field id="pd-title" label="Title (new documents only)">
        <input id="pd-title" name="title" className={inputClass} />
      </Field>
      <Field id="pd-body" label="Body (Markdown, `## Section` blocks)" required>
        <textarea id="pd-body" name="body" rows={8} className={`${inputClass} t-code`} required />
      </Field>
      <Field
        id="pd-rules"
        label="Machine rules (JSON) — what authorization actually reads"
        hint='Example: {"billing.review_window_days": 60}'
      >
        <textarea id="pd-rules" name="rules" rows={3} className={`${inputClass} t-code`} defaultValue="{}" />
      </Field>
      <Field id="pd-topics" label="Topics (comma separated)">
        <input id="pd-topics" name="topics" className={inputClass} />
      </Field>
      <SubmitButton>Save draft</SubmitButton>
    </ActionForm>
  );
}
export function WorkflowEditor({ initial }: { initial: string }) {
  return (
    <ActionForm action={workflowSaveAction} className="space-y-3">
      <Field
        id="wf-spec"
        label="Workflow definition (JSON)"
        hint="Validated on save: node references, reachability, objectives, and an end node. Saving creates a new draft version; a different person must publish it."
      >
        <textarea
          id="wf-spec"
          name="spec"
          rows={18}
          defaultValue={initial}
          className={`${inputClass} t-code`}
          spellCheck={false}
        />
      </Field>
      <SubmitButton>Validate &amp; save draft</SubmitButton>
    </ActionForm>
  );
}
export function PlanForm({ plans, current }: { plans: { key: string; name: string }[]; current: string }) {
  return (
    <ActionForm action={changePlanAction} className="flex flex-wrap items-end gap-3">
      <Field id="plan" label="Change plan (test billing — no card, no charge)">
        <select id="plan" name="plan" defaultValue={current} className={inputClass}>
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="secondary">Change plan</SubmitButton>
    </ActionForm>
  );
}
