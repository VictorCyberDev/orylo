"use client";
import { ActionForm, SubmitButton } from "./client";
import { requestErasureAction } from "@/app/actions";
import { Field, inputClass } from "./ui";

export function ErasureForm() {
  return (
    <ActionForm action={requestErasureAction} className="space-y-3">
      <Field
        id="erase-reason"
        label="Anything you'd like us to know? (optional)"
        hint="A team member reviews every request. Open cases must be closed first."
      >
        <textarea id="erase-reason" name="reason" rows={2} maxLength={500} className={inputClass} />
      </Field>
      <SubmitButton variant="danger">Request erasure of my data</SubmitButton>
    </ActionForm>
  );
}
