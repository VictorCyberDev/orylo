"use client";
import { useActionState } from "react";
import { issuePortalLinkAction } from "@/app/actions";
import { CopyButton, SubmitButton } from "./client";
import { Alert } from "./ui";

export function PortalLinkForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(issuePortalLinkAction, { ok: false } as {
    ok: boolean;
    link?: string;
    error?: string;
    message?: string;
  });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <p className="t-caption">
        Creates a case-scoped link (valid 24 h) the customer can open without a password. Share it only
        through a channel you trust.
      </p>
      <SubmitButton variant="secondary">Create access link</SubmitButton>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.link ? (
        <div className="space-y-2">
          <p className="t-code break-all rounded bg-surface-2 p-2">
            {typeof window !== "undefined" ? window.location.origin : ""}
            {state.link}
          </p>
          <CopyButton
            value={`${typeof window !== "undefined" ? window.location.origin : ""}${state.link}`}
            label="Copy link"
          />
        </div>
      ) : null}
    </form>
  );
}
