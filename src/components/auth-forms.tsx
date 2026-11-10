"use client";
import { ActionForm, SubmitButton } from "./client";
import {
  acceptInviteSignedInAction,
  requestPasswordResetAction,
  resetPasswordAction,
  signInAction,
  signUpForInviteAction,
} from "@/app/actions";
import { Field, inputClass } from "./ui";

export function SignInForm({ next, email }: { next?: string; email?: string }) {
  return (
    <ActionForm action={signInAction} className="space-y-4" successToast={false}>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="email" label="Email" required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={email}
          required
          className={inputClass}
        />
      </Field>
      <Field id="password" label="Password" required>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}
export function ForgotForm() {
  return (
    <ActionForm action={requestPasswordResetAction} className="space-y-4">
      <Field id="email" label="Email" required>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </ActionForm>
  );
}
export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" hint="At least 10 characters." required>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton className="w-full">Set new password</SubmitButton>
    </ActionForm>
  );
}
export function InviteSignUpForm({ token, email }: { token: string; email: string }) {
  return (
    <ActionForm action={signUpForInviteAction} className="space-y-4" successToast={false}>
      <input type="hidden" name="token" value={token} />
      <Field id="name" label="Your name" required>
        <input id="name" name="name" autoComplete="name" required className={inputClass} />
      </Field>
      <Field id="email" label="Email" hint="Must match the address the invitation was sent to.">
        <input id="email" name="email" type="email" defaultValue={email} readOnly className={inputClass} />
      </Field>
      <Field id="password" label="Choose a password" hint="At least 10 characters." required>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton className="w-full">Create account &amp; join</SubmitButton>
    </ActionForm>
  );
}
export function AcceptInviteForm({ token }: { token: string }) {
  return (
    <ActionForm action={acceptInviteSignedInAction} className="space-y-4" successToast={false}>
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="w-full">Accept invitation</SubmitButton>
    </ActionForm>
  );
}
