import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";
export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; expired?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AuthShell
      title="Sign in"
      subtitle="Customers and staff use the same sign-in; you'll land in the right place."
      footer={
        <>
          <Link className="underline" href="/forgot-password">
            Forgot password?
          </Link>{" "}
          ·{" "}
          <Link className="underline" href="/demo">
            Demo accounts
          </Link>
        </>
      }
    >
      {sp.expired ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning"
        >
          That access link has expired or is no longer valid. Sign in, or ask for a new link.
        </p>
      ) : null}
      <SignInForm next={sp.next} email={sp.email} />
    </AuthShell>
  );
}
