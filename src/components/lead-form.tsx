"use client";
import { ActionForm, SubmitButton } from "./client";
import { leadAction } from "@/app/actions";
import { Field, Alert, inputClass } from "./ui";

export function LeadForm() {
  return (
    <ActionForm action={leadAction} successToast={false} className="space-y-4">
      {(r) =>
        r.ok ? (
          <div role="status" className="rounded-lg border border-success/40 bg-success-bg p-5">
            <p className="t-h3 text-success">Thanks — your request is in.</p>
            <p className="mt-1 text-sm">
              We&apos;ve recorded it. There is no automatic email in this demo environment, so a person will
              follow up from the saved request.
            </p>
          </div>
        ) : (
          <>
            <div aria-hidden className="absolute -left-[9999px]">
              <label>
                Leave blank
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <Field id="name" label="Your name" required error={r.fieldErrors?.name}>
              <input
                id="name"
                name="name"
                autoComplete="name"
                required
                className={inputClass}
                aria-invalid={!!r.fieldErrors?.name}
                aria-describedby={r.fieldErrors?.name ? "name-error" : undefined}
              />
            </Field>
            <Field id="email" label="Work email" required error={r.fieldErrors?.email}>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={inputClass}
                aria-invalid={!!r.fieldErrors?.email}
                aria-describedby={r.fieldErrors?.email ? "email-error" : undefined}
              />
            </Field>
            <Field id="company" label="Company">
              <input id="company" name="company" autoComplete="organization" className={inputClass} />
            </Field>
            <Field id="useCase" label="What do you want to fix?">
              <select id="useCase" name="useCase" className={inputClass} defaultValue="">
                <option value="">Choose one…</option>
                <option value="subscription_billing">Subscription / billing exceptions</option>
                <option value="telecom_service">Service operations</option>
                <option value="digital_commerce">Digital commerce exceptions</option>
                <option value="warranty_claims">Warranty &amp; claims</option>
                <option value="general">Something else</option>
              </select>
            </Field>
            <Field id="message" label="Anything we should know?">
              <textarea id="message" name="message" rows={4} className={inputClass} />
            </Field>
            <Alert tone="info">
              Please don&apos;t include real customer data. We store your request in our database and nowhere
              else.
            </Alert>
            <SubmitButton pendingLabel="Sending…">Request early access</SubmitButton>
          </>
        )
      }
    </ActionForm>
  );
}
