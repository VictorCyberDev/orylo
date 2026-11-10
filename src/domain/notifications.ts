import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { customers, memberships, notifications, organizations, type OrgRole } from "@/db/schema";
import type { DbOrTx } from "@/db";

export type NotificationType =
  | "approval_required"
  | "information_required"
  | "action_completed"
  | "action_failed"
  | "case_assigned"
  | "escalation_updated"
  | "outcome_verified"
  | "case_reopened"
  | "consent_requested";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}
export interface EmailAdapter {
  send(msg: EmailMessage): Promise<{ status: "SENT" | "SKIPPED" | "FAILED"; detail: string }>;
}

/**
 * Default adapter: never sends. Wiring a real provider (e.g. Resend/Postmark) means implementing
 * EmailAdapter and returning it from getEmailAdapter() when its API key is configured. Until then
 * email rows are recorded as SKIPPED — never "sent".
 */
export const SkippedEmailAdapter: EmailAdapter = {
  async send() {
    return { status: "SKIPPED", detail: "No email provider configured; message not sent." };
  },
};
export function getEmailAdapter(): EmailAdapter {
  return SkippedEmailAdapter;
}

interface Base {
  orgId: string;
  caseId?: string;
  type: NotificationType;
  title: string;
  body?: string;
}

export async function notifyCustomer(db: DbOrTx, n: Base & { customerId: string }) {
  const [c] = await db
    .select({ prefs: customers.preferences, email: customers.email })
    .from(customers)
    .where(and(eq(customers.id, n.customerId), eq(customers.organizationId, n.orgId)));
  if (!c) return;
  if (c.prefs.notifyInApp) {
    await db.insert(notifications).values({
      organizationId: n.orgId,
      recipientCustomerId: n.customerId,
      caseId: n.caseId,
      type: n.type,
      title: n.title,
      body: n.body ?? "",
    });
  }
  if (c.prefs.notifyEmail) {
    const [org] = await db.select({ s: organizations.settings }).from(organizations).where(eq(organizations.id, n.orgId));
    if (org?.s.emailNotifications) {
      const r = await getEmailAdapter().send({ to: c.email, subject: n.title, body: n.body ?? "" });
      await db.insert(notifications).values({
        organizationId: n.orgId,
        recipientCustomerId: n.customerId,
        caseId: n.caseId,
        type: n.type,
        title: n.title,
        body: n.body ?? "",
        channel: "email",
        deliveryStatus: r.status === "SENT" ? "DELIVERED" : r.status,
        deliveryDetail: r.detail,
      });
    }
  }
}

export async function notifyUser(db: DbOrTx, n: Base & { userId: string }) {
  await db.insert(notifications).values({
    organizationId: n.orgId,
    recipientUserId: n.userId,
    caseId: n.caseId,
    type: n.type,
    title: n.title,
    body: n.body ?? "",
  });
}

export async function notifyRoles(db: DbOrTx, n: Base & { roles: OrgRole[] }) {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, n.orgId), inArray(memberships.role, n.roles), eq(memberships.status, "active")));
  for (const r of rows) await notifyUser(db, { ...n, userId: r.userId });
}

export async function listForUser(db: DbOrTx, orgId: string, userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.organizationId, orgId), eq(notifications.recipientUserId, userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
export async function listForCustomer(db: DbOrTx, orgId: string, customerId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.organizationId, orgId), eq(notifications.recipientCustomerId, customerId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
export async function unreadCountForUser(db: DbOrTx, orgId: string, userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.organizationId, orgId), eq(notifications.recipientUserId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}
export async function markRead(db: DbOrTx, orgId: string, id: string, who: { userId?: string; customerId?: string }) {
  const own = who.userId ? eq(notifications.recipientUserId, who.userId) : eq(notifications.recipientCustomerId, who.customerId ?? "00000000-0000-0000-0000-000000000000");
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.organizationId, orgId), own));
}
