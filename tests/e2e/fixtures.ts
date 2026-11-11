/**
 * Isolated, deterministic test data for browser journeys. Each journey gets its OWN synthetic customer (login, provider
 * account, earlier cancellation, charge) so tests never depend on — or disturb — the shared demo seed, and can be re-run.
 * Uses the real database and the real domain code (not mocks).
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!process.env.DATABASE_URL)
  for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import {
  accounts,
  customers,
  organizations,
  simAccounts,
  simCancellationRequests,
  simCharges,
  users,
  verifications,
} from "@/db/schema";
import { openWorkflowCase } from "@/workflows/engine";
import type { Ctx } from "@/domain/context";

export const PASSWORD = "OryloDemo!2026";
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

export interface Fixture {
  email: string;
  name: string;
  customerId: string;
  orgId: string;
  accountNumber: string;
  ctx: Ctx;
}

export async function nfOrgId() {
  const [o] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "northfield"));
  return o.id;
}

export async function newCustomer(
  label: string,
  opts: { priceCents?: number; cancelled?: boolean; priorRequest?: boolean; charge?: boolean } = {},
): Promise<Fixture> {
  const orgId = await nfOrgId();
  const tag = randomBytes(4).toString("hex");
  const email = `${label}.${tag}@customer.example`;
  const name = `Fixture ${label} ${tag}`;
  const userId = `usr_fx_${tag}`;
  await db.insert(users).values({ id: userId, name, email, emailVerified: true });
  await db.insert(accounts).values({
    id: `acc_${userId}`,
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(PASSWORD),
  });
  const [c] = await db
    .insert(customers)
    .values({ organizationId: orgId, externalRef: `FX-${tag}`, name, email, userId, synthetic: true })
    .returning();
  const accountNumber = `NF-9${Math.floor(10000 + Math.random() * 89999)}`;
  const price = opts.priceCents ?? 2999;
  const [a] = await db
    .insert(simAccounts)
    .values({
      organizationId: orgId,
      accountNumber,
      customerId: c.id,
      planName: "Northfield Plus",
      priceCents: price,
      status: opts.cancelled ? "CANCELLED" : "ACTIVE",
      billingActive: !opts.cancelled,
      cancelledAt: opts.cancelled ? ago(20) : null,
      nextBillingAt: opts.cancelled ? null : new Date(Date.now() + 20 * DAY),
    })
    .returning();
  if (opts.priorRequest !== false && !opts.cancelled)
    await db.insert(simCancellationRequests).values({
      organizationId: orgId,
      accountId: a.id,
      requestedAt: ago(9),
      channel: "web_form",
      status: "FAILED_TO_APPLY",
    });
  if (opts.charge !== false)
    await db.insert(simCharges).values({
      organizationId: orgId,
      accountId: a.id,
      amountCents: price,
      description: "Northfield Plus — monthly",
      chargedAt: ago(3),
      status: "POSTED",
    });
  return {
    email,
    name,
    customerId: c.id,
    orgId,
    accountNumber,
    ctx: { orgId, actor: { type: "customer", id: `fx:${tag}`, customerId: c.id } },
  };
}

/** A recovery case already diagnosed (READY_FOR_ACTION) — set-up via the real workflow engine. */
export async function newRecoveryCase(f: Fixture, workflowKey = "failed-cancellation-billing-recovery") {
  return openWorkflowCase(db, f.ctx, {
    workflowKey,
    customerId: f.customerId,
    title: "I cancelled but was charged again",
    source: "portal",
    accountNumber: f.accountNumber,
  });
}

export async function accountRow(f: Fixture) {
  const [a] = await db
    .select()
    .from(simAccounts)
    .where(and(eq(simAccounts.organizationId, f.orgId), eq(simAccounts.accountNumber, f.accountNumber)));
  return a;
}

export async function latestResetToken(userEmail: string): Promise<string | null> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, userEmail));
  if (!u) return null;
  const rows = await db.select().from(verifications).orderBy(verifications.createdAt);
  const hit = rows.filter((r) => r.identifier.startsWith("reset-password:") && r.value === u.id).at(-1);
  return hit ? hit.identifier.replace("reset-password:", "") : null;
}

export { db };
