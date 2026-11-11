import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customerAccessGrants, organizations, resolutionCases } from "@/db/schema";
import { sha256Hex } from "@/domain/crypto";
import { AuthShell } from "@/components/auth-shell";
import { AccessLinkForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Open your case", robots: { index: false, follow: false } };

/**
 * Case-access links never establish a session on GET (link scanners, prefetchers and "login CSRF" attacks all issue GETs).
 * The person must press the button, which runs a server action. The page shows only what the link is for — no personal data.
 */
export default async function AccessLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [g] = await db
    .select({ caseRef: resolutionCases.reference, org: organizations.name })
    .from(customerAccessGrants)
    .innerJoin(organizations, eq(organizations.id, customerAccessGrants.organizationId))
    .leftJoin(resolutionCases, eq(resolutionCases.id, customerAccessGrants.caseId))
    .where(
      and(
        eq(customerAccessGrants.tokenHash, sha256Hex(token)),
        isNull(customerAccessGrants.revokedAt),
        gt(customerAccessGrants.expiresAt, new Date()),
      ),
    );
  if (!g)
    return (
      <AuthShell title="This link isn't valid">
        <Alert tone="danger" title="It has expired, was withdrawn, or is incomplete">
          Ask the team that sent it for a new link, or sign in to see your cases.
        </Alert>
      </AuthShell>
    );
  return (
    <AuthShell
      title="Open your case"
      subtitle={`${g.org.replace(/ \(synthetic\)/, "")}${g.caseRef ? ` · ${g.caseRef}` : ""}`}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          This link lets you <strong>view</strong> your case without a password. To confirm a step, upload
          evidence or ask for a person, you&apos;ll need to sign in. Only open it on a device you trust.
        </p>
        <AccessLinkForm token={token} />
      </div>
    </AuthShell>
  );
}
