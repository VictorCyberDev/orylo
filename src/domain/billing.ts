/**
 * Commercial foundation. TEST billing provider only: no card data, no live charges, ever, from this module.
 * Prices are PROVISIONAL experiments (see docs/strategy/03-market-hypotheses-and-pricing.md).
 * "Verified outcome" (Orylo) ≠ "conversation resolution" (eGain's billable unit).
 */
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { invoices, memberships, plans, subscriptions, usageRecords, apiKeys } from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { Ctx } from "./context";
import { AppError, forbidden, notFound } from "./errors";
import { requirePermission } from "./rbac";
import { audit } from "./audit";

export async function planCatalog(db: DbOrTx) {
  return db.select().from(plans).orderBy(asc(plans.priceCentsMonthly));
}

export async function billingOverview(db: DbOrTx, ctx: Ctx) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "billing.read");
  const [sub] = await db
    .select({ s: subscriptions, p: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.organizationId, ctx.orgId));
  if (!sub) throw notFound("Subscription");
  const periodStart = sub.s.currentPeriodStart;
  const usage = await db
    .select({ metric: usageRecords.metric, qty: sql<number>`coalesce(sum(${usageRecords.quantity}),0)::int` })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, ctx.orgId), gte(usageRecords.occurredAt, periodStart)))
    .groupBy(usageRecords.metric);
  const [{ ops }] = await db
    .select({ ops: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.organizationId, ctx.orgId), eq(memberships.status, "active")));
  const [{ keys }] = await db
    .select({ keys: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, ctx.orgId), sql`${apiKeys.revokedAt} is null`));
  const inv = await db
    .select()
    .from(invoices)
    .where(eq(invoices.organizationId, ctx.orgId))
    .orderBy(desc(invoices.periodStart));
  const used = Object.fromEntries(usage.map((u) => [u.metric, u.qty]));
  const ent = sub.p.entitlements;
  return {
    subscription: {
      status: sub.s.status,
      provider: sub.s.provider,
      trialEndsAt: sub.s.trialEndsAt,
      currentPeriodEnd: sub.s.currentPeriodEnd,
      cancelledAt: sub.s.cancelledAt,
      testMode: true as const,
    },
    plan: {
      key: sub.p.key,
      name: sub.p.name,
      priceCentsMonthly: sub.p.priceCentsMonthly,
      experimental: sub.p.experimental,
      entitlements: ent,
    },
    usage: {
      verifiedOutcomes: used.verified_outcome ?? 0,
      casesOpened: used.case_opened ?? 0,
      actionsExecuted: used.action_executed ?? 0,
      members: ops,
      apiKeys: keys,
    },
    limits: {
      verifiedOutcomesRemaining: Math.max(0, ent.includedVerifiedOutcomes - (used.verified_outcome ?? 0)),
      membersRemaining: Math.max(0, ent.maxOperators - ops),
    },
    invoices: inv.map((i) => ({
      id: i.id,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      amountCents: i.amountCents,
      status: i.status,
      testMode: i.testMode,
    })),
  };
}

export async function assertEntitlement(
  db: DbOrTx,
  orgId: string,
  feature: "apiAccess" | "customBranding" | "member",
) {
  const [sub] = await db
    .select({ s: subscriptions, p: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.organizationId, orgId));
  if (!sub || sub.s.status === "cancelled")
    throw new AppError("FORBIDDEN", "This organization's subscription is not active");
  const e = sub.p.entitlements;
  if (feature === "apiAccess" && !e.apiAccess)
    throw new AppError(
      "FORBIDDEN",
      `Your plan (${sub.p.name}) does not include API access. Upgrade to enable it.`,
    );
  if (feature === "customBranding" && !e.customBranding)
    throw new AppError("FORBIDDEN", `Your plan (${sub.p.name}) does not include custom branding.`);
  if (feature === "member") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.organizationId, orgId), eq(memberships.status, "active")));
    if (n >= e.maxOperators)
      throw new AppError(
        "FORBIDDEN",
        `Your plan (${sub.p.name}) allows ${e.maxOperators} team members. Upgrade to add more.`,
      );
  }
}

export async function changePlan(db: DbOrTx, ctx: Ctx, planKey: string) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "billing.manage");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(plans).where(eq(plans.key, planKey));
    if (!p) throw notFound("Plan");
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 86_400_000);
    const [s] = await tx
      .update(subscriptions)
      .set({
        planId: p.id,
        status: p.priceCentsMonthly === 0 ? "trialing" : "active",
        currentPeriodStart: now,
        currentPeriodEnd: end,
        cancelledAt: null,
      })
      .where(eq(subscriptions.organizationId, ctx.orgId))
      .returning();
    if (p.priceCentsMonthly > 0)
      await tx.insert(invoices).values({
        organizationId: ctx.orgId,
        subscriptionId: s.id,
        periodStart: now,
        periodEnd: end,
        amountCents: p.priceCentsMonthly,
        status: "test_paid",
        testMode: true,
      });
    await audit(tx, ctx, {
      action: "billing.plan_change",
      targetType: "subscription",
      targetId: s.id,
      metadata: { plan: planKey, testMode: true },
    });
    return s;
  });
}

export async function cancelSubscription(db: DbOrTx, ctx: Ctx) {
  if (ctx.actor.type !== "operator") throw forbidden();
  requirePermission(ctx.actor.role, "billing.manage");
  const [s] = await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(subscriptions.organizationId, ctx.orgId))
    .returning();
  await audit(db, ctx, { action: "billing.cancel", targetType: "subscription", targetId: s.id });
  return s;
}
