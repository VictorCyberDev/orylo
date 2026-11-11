/** Platform maintenance: retention, expiry and safety-net sweeps. All steps are idempotent and safe to re-run. */
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db as rootDb, type DbOrTx } from "@/db";
import {
  actionRequests,
  authRateLimits,
  caseEvidence,
  customerAccessGrants,
  notifications,
  organizations,
  rateLimits,
  resolutionCases,
  sessions,
} from "@/db/schema";
import { systemCtx } from "@/domain/context";
import { appendEvent, lockCase } from "@/domain/cases";
import { escalateCase } from "@/domain/escalation";
import { audit } from "@/domain/audit";
import { sweepTimeouts } from "@/workflows/engine";

export const CONSENT_PROPOSAL_TTL_DAYS = 7;
const DAY = 86_400_000;

export async function expireStaleConsents(db: DbOrTx, now = new Date()) {
  const stale = await db
    .select({ id: actionRequests.id, orgId: actionRequests.organizationId, caseId: actionRequests.caseId })
    .from(actionRequests)
    .where(
      and(
        eq(actionRequests.status, "AWAITING_CONSENT"),
        lt(actionRequests.createdAt, new Date(now.getTime() - CONSENT_PROPOSAL_TTL_DAYS * DAY)),
      ),
    );
  let expired = 0;
  for (const r of stale) {
    await db.transaction(async (tx) => {
      const sys = systemCtx(r.orgId, "maintenance");
      const row = await lockCase(tx, sys, r.caseId);
      const [u] = await tx
        .update(actionRequests)
        .set({
          status: "CANCELLED",
          failureCode: "CONSENT_EXPIRED",
          failureMessage: "No response within the allowed time",
          updatedAt: now,
        })
        .where(and(eq(actionRequests.id, r.id), eq(actionRequests.status, "AWAITING_CONSENT")))
        .returning({ id: actionRequests.id });
      if (!u) return; // someone answered in the meantime
      await appendEvent(tx, sys, row.id, {
        type: "action.expired",
        message: "A proposed step expired because we didn't hear back. A person will follow up.",
        payload: { requestId: r.id },
      });
      await audit(tx, sys, { action: "action.expire", targetType: "action_request", targetId: r.id });
      if (["READY_FOR_ACTION", "AWAITING_APPROVAL"].includes(row.state))
        await escalateCase(tx, sys, row.id, {
          reason: "A proposed step expired without a customer response",
          reasonCode: "CONSENT_EXPIRED",
        });
      expired++;
    });
  }
  return expired;
}

export async function purgeRetention(db: DbOrTx, now = new Date()) {
  const orgs = await db.select({ id: organizations.id, s: organizations.settings }).from(organizations);
  let evidence = 0;
  for (const o of orgs) {
    const cutoff = new Date(now.getTime() - o.s.retentionDays * DAY);
    const closed = db
      .select({ id: resolutionCases.id })
      .from(resolutionCases)
      .where(
        and(
          eq(resolutionCases.organizationId, o.id),
          isNotNull(resolutionCases.closedAt),
          lt(resolutionCases.closedAt, cutoff),
        ),
      );
    const r = await db
      .delete(caseEvidence)
      .where(and(eq(caseEvidence.organizationId, o.id), inArray(caseEvidence.caseId, closed)))
      .returning({ id: caseEvidence.id });
    evidence += r.length;
  }
  const n1 = await db
    .delete(notifications)
    .where(
      and(isNotNull(notifications.readAt), lt(notifications.createdAt, new Date(now.getTime() - 90 * DAY))),
    )
    .returning({ id: notifications.id });
  const n2 = await db
    .delete(customerAccessGrants)
    .where(lt(customerAccessGrants.expiresAt, new Date(now.getTime() - 30 * DAY)))
    .returning({ id: customerAccessGrants.id });
  const n3 = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  const n4 = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now.getTime() - DAY)))
    .returning({ k: rateLimits.key });
  const n5 = await db
    .delete(authRateLimits)
    .where(sql`${authRateLimits.lastRequest} < ${now.getTime() - DAY}`)
    .returning({ id: authRateLimits.id });
  return {
    evidence,
    notifications: n1.length,
    grants: n2.length,
    sessions: n3.length,
    rateLimits: n4.length,
    authRateLimits: n5.length,
  };
}

export async function runMaintenance(db: DbOrTx = rootDb, now = new Date()) {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  let swept = 0;
  for (const o of orgs) swept += (await sweepTimeouts(db, o.id)).checked;
  const expiredConsents = await expireStaleConsents(db, now);
  const retention = await purgeRetention(db, now);
  return { swept, expiredConsents, retention };
}
