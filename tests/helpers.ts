import { db, pool } from "@/db";
import { resetAllTables, seedWorld, type World } from "@/seed/world";
import type { Ctx } from "@/domain/context";
import { eq, and } from "drizzle-orm";
import { simAccounts, integrationConnections, resolutionCases } from "@/db/schema";
import type { SimMode } from "@/adapters/subscription";
import { openWorkflowCase } from "@/workflows/engine";
import { actionsForCase } from "@/domain/actions";

export { db, pool };

export async function freshWorld(): Promise<World> {
  await resetAllTables(db);
  return seedWorld(db);
}

export const op = (w: World, key: keyof World["users"] = "nfOperator"): Ctx => ({
  orgId: w.users[key].orgId,
  actor: { type: "operator", id: w.users[key].id, role: w.users[key].role },
});
export const cust = (w: World, key: string): Ctx => ({
  orgId: w.customers[key].orgId,
  actor: { type: "customer", id: `portal:${key}`, customerId: w.customers[key].id },
});

export async function setMode(orgId: string, mode: SimMode, delayMs = 400) {
  await db
    .update(integrationConnections)
    .set({ config: { mode, delayMs } })
    .where(
      and(
        eq(integrationConnections.organizationId, orgId),
        eq(integrationConnections.provider, "demo_subscription"),
      ),
    );
}

export async function acct(orgId: string, no: string) {
  const [a] = await db
    .select()
    .from(simAccounts)
    .where(and(eq(simAccounts.organizationId, orgId), eq(simAccounts.accountNumber, no)));
  return a;
}

export async function openRecoveryCase(w: World, who = "jordan") {
  const ctx = cust(w, who);
  const row = await openWorkflowCase(db, ctx, {
    workflowKey: "failed-cancellation-billing-recovery",
    customerId: w.customers[who].id,
    title: "I cancelled but was charged again",
    description: "Cancelled last week; charged again.",
    source: "portal",
  });
  const actions = await actionsForCase(db, ctx, row.id);
  return { ctx, row, actions };
}

export async function caseState(id: string) {
  const [c] = await db.select().from(resolutionCases).where(eq(resolutionCases.id, id));
  return c;
}
