"use client";
import { ActionForm, SubmitButton } from "./client";
import { openCaseAction } from "@/app/actions";
import { Field, inputClass } from "./ui";
import { useState } from "react";
const options = [
  ["failed-cancellation-billing-recovery", "I cancelled, but I was charged again", "We'll find your earlier request and check your account."],
  ["missed-appointment-recovery", "A service appointment was missed", "Tell us the date once; we'll hand a complete request to the scheduling team."],
  ["warranty-claim-readiness", "My device is faulty and I want to claim warranty", "We'll gather everything a claim needs so you aren't asked twice."],
] as const;
export function NewCaseForm({ accounts }: { accounts: string[] }) {
  const [key, setKey] = useState<string>(options[0][0]);
  return (
    <ActionForm action={openCaseAction} successToast={false} className="space-y-6">
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">What happened?</legend>
        {options.map(([v, l, d]) => (
          <label key={v} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-surface p-4 has-[:checked]:border-accent-text has-[:checked]:bg-active">
            <input type="radio" name="workflowKey" value={v} checked={key === v} onChange={() => setKey(v)} className="mt-1 h-4 w-4" />
            <span><span className="block font-medium">{l}</span><span className="t-caption">{d}</span></span>
          </label>
        ))}
      </fieldset>
      {key === "failed-cancellation-billing-recovery" ? (
        <Field id="accountNumber" label="Account number" hint={accounts.length ? `We found: ${accounts.join(", ")}. Leave blank to use it.` : "Find it on your receipt."}><input id="accountNumber" name="accountNumber" className={inputClass} placeholder={accounts[0] ?? "e.g. NF-100234"} autoComplete="off" /></Field>
      ) : null}
      <Field id="description" label="Anything you'd like us to know? (optional)"><textarea id="description" name="description" rows={3} className={inputClass} maxLength={2000} /></Field>
      <SubmitButton pendingLabel="Opening your case…">Open my case</SubmitButton>
    </ActionForm>
  );
}
