import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {token ? (
        <ResetForm token={token} />
      ) : (
        <Alert tone="danger" title="This link is incomplete">
          Request a new reset link and try again.
        </Alert>
      )}
    </AuthShell>
  );
}
