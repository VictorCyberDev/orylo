"use client";
import { ActionForm, SubmitButton } from "./client";
import { savePrefsAction } from "@/app/actions";
export function PrefsForm({ notifyEmail, notifyInApp }: { notifyEmail: boolean; notifyInApp: boolean }) {
  return (
    <ActionForm action={savePrefsAction} className="space-y-4">
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="notifyInApp" defaultChecked={notifyInApp} className="h-5 w-5" /> In-app
        updates
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="notifyEmail" defaultChecked={notifyEmail} className="h-5 w-5" /> Email
        updates <span className="t-caption">(this demo has no email provider, so none are sent)</span>
      </label>
      <SubmitButton>Save preferences</SubmitButton>
    </ActionForm>
  );
}
