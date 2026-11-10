import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { invitations, organizations } from "@/db/schema";
import { sha256Hex } from "@/domain/crypto";
import { getUser } from "@/auth/session";
import { AuthShell } from "@/components/auth-shell";
import { AcceptInviteForm, InviteSignUpForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";
export const metadata: Metadata = { title: "Join your team", robots: { index: false } };
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv] = await db
    .select({ i: invitations, org: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(
      and(
        eq(invitations.tokenHash, sha256Hex(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  if (!inv)
    return (
      <AuthShell title="Invitation not valid">
        <Alert tone="danger" title="This invitation has expired, been used, or was withdrawn">
          Ask your administrator for a new one.
        </Alert>
      </AuthShell>
    );
  const user = await getUser();
  return (
    <AuthShell
      title={`Join ${inv.org}`}
      subtitle={`You've been invited as ${inv.i.role.replace("_", " ")}.`}
      footer={
        !user ? (
          <Link className="underline" href={`/sign-in?next=/invite/${token}`}>
            Already have an account? Sign in
          </Link>
        ) : undefined
      }
    >
      {user ? (
        user.email.toLowerCase() === inv.i.email.toLowerCase() ? (
          <AcceptInviteForm token={token} />
        ) : (
          <Alert tone="danger" title="Wrong account">
            You&apos;re signed in as {user.email}, but this invitation is for another address.
          </Alert>
        )
      ) : (
        <InviteSignUpForm token={token} email={inv.i.email} />
      )}
    </AuthShell>
  );
}
