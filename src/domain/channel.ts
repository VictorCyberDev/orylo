/** Customer access grants and the eGain (channel) session flow. */
import { and, desc, eq, gt, isNull, notInArray } from "drizzle-orm";
import { customerAccessGrants, customers, resolutionCases } from "@/db/schema";
import type { DbOrTx } from "@/db";
import { db as rootDb } from "@/db";
import { AppError } from "./errors";
import { randomToken, sha256Hex } from "./crypto";
import type { Ctx } from "./context";
import { rateLimit } from "./rate-limit";
import { audit } from "./audit";
import { getSubscriptionProvider } from "@/adapters/subscription";
import { openWorkflowCase } from "@/workflows/engine";
import { systemCtx } from "./context";

export async function issueAccessGrant(
  db: DbOrTx,
  p: {
    orgId: string;
    customerId: string;
    caseId?: string | null;
    via: "operator" | "egain" | "portal";
    ttlMinutes: number;
    scopes?: string[];
  },
) {
  const token = randomToken(32);
  const [g] = await db
    .insert(customerAccessGrants)
    .values({
      organizationId: p.orgId,
      customerId: p.customerId,
      caseId: p.caseId ?? null,
      tokenHash: sha256Hex(token),
      issuedVia: p.via,
      scopes: p.scopes ?? ["case:read", "case:act"],
      expiresAt: new Date(Date.now() + p.ttlMinutes * 60_000),
    })
    .returning();
  return { token, grant: g };
}

export async function resolveGrant(db: DbOrTx, token: string | null | undefined, orgId?: string) {
  if (!token) throw new AppError("UNAUTHENTICATED", "Missing customer token");
  const [g] = await db
    .select()
    .from(customerAccessGrants)
    .where(
      and(
        eq(customerAccessGrants.tokenHash, sha256Hex(token)),
        isNull(customerAccessGrants.revokedAt),
        gt(customerAccessGrants.expiresAt, new Date()),
      ),
    );
  if (!g || (orgId && g.organizationId !== orgId))
    throw new AppError("UNAUTHENTICATED", "That session has expired or is not valid");
  await db
    .update(customerAccessGrants)
    .set({ lastUsedAt: new Date() })
    .where(eq(customerAccessGrants.id, g.id));
  return g;
}

export const channelCtx = (
  g: { organizationId: string; customerId: string; id: string },
  channel = "egain",
): Ctx => ({
  orgId: g.organizationId,
  actor: { type: "channel", id: `${channel}:${g.id}`, customerId: g.customerId },
});

export interface EgainSessionInput {
  fullName: string;
  email: string;
  accountNumber: string;
  issue: string;
}

/**
 * Pre-chat → verified identity → case. Identity = email AND account number must belong to the same customer
 * (policy: identity-verification, 2 factors). A mismatch never reveals whether the account exists.
 */
export async function createEgainSession(
  db: DbOrTx,
  p: { orgId: string; keyId: string },
  input: EgainSessionInput,
) {
  const email = input.email.trim().toLowerCase();
  await rateLimit(db, `egain-session:${p.keyId}:${sha256Hex(email).slice(0, 16)}`, 6, 600);
  const provider = await getSubscriptionProvider(rootDb, p.orgId);
  const acct = await provider.readAccount(p.orgId, input.accountNumber.trim());
  let customerId: string | null = null;
  if (acct) {
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, acct.customerId), eq(customers.organizationId, p.orgId)));
    if (c && c.email.toLowerCase() === email) customerId = c.id;
  }
  if (!customerId) {
    await audit(
      db,
      { orgId: p.orgId, actor: { type: "integration", id: `egain-key:${p.keyId}` } },
      { action: "egain.session", outcome: "denied", metadata: { reason: "identity_mismatch" } },
    );
    return {
      verified: false as const,
      message: "We couldn't verify those details. You can try again or ask for a person.",
    };
  }
  // Resume the customer's open recovery case instead of making them start over.
  const [existing] = await db
    .select()
    .from(resolutionCases)
    .where(
      and(
        eq(resolutionCases.organizationId, p.orgId),
        eq(resolutionCases.customerId, customerId),
        eq(resolutionCases.category, "failed_cancellation"),
        notInArray(resolutionCases.state, ["VERIFIED_RESOLVED", "CANCELLED", "FAILED"]),
      ),
    )
    .orderBy(desc(resolutionCases.openedAt))
    .limit(1);
  const { token, grant } = await issueAccessGrant(db, {
    orgId: p.orgId,
    customerId,
    caseId: existing?.id ?? null,
    via: "egain",
    ttlMinutes: 30,
    scopes: ["case:read", "case:act"],
  });
  const ctx: Ctx = { orgId: p.orgId, actor: { type: "channel", id: `egain:${grant.id}`, customerId } };
  const row =
    existing ??
    (await openWorkflowCase(db, ctx, {
      workflowKey: "failed-cancellation-billing-recovery",
      customerId,
      title: "Charged again after cancelling",
      description: input.issue.slice(0, 1000),
      source: "egain",
      accountNumber: input.accountNumber.trim(),
    }));
  if (!existing)
    await db
      .update(customerAccessGrants)
      .set({ caseId: row.id })
      .where(eq(customerAccessGrants.id, grant.id));
  await audit(db, ctx, {
    action: "egain.session",
    targetType: "case",
    targetId: row.id,
    metadata: { resumed: !!existing },
  });
  return {
    verified: true as const,
    caseReference: row.reference,
    customerToken: token,
    state: row.state,
    resumed: !!existing,
  };
}

export { systemCtx };
