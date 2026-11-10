/**
 * Pre-existing SYNTHETIC cases so the console and analytics are not empty on first run.
 * Built through the real domain functions (workflow engine, Action Gateway), not inserted rows,
 * so every record has a genuine audit trail and ledger entry. Jordan is deliberately left WITHOUT a case:
 * the canonical demo starts with Jordan opening one.
 */
import type { Db } from "@/db";
import type { World } from "./world";
import type { Ctx } from "@/domain/context";
import { openWorkflowCase, advance } from "@/workflows/engine";
import { actionsForCase, confirmAction, submitAction } from "@/domain/actions";
import { transitionCase } from "@/domain/cases";
import { escalateCase, takeOwnership } from "@/domain/escalation";
import { simBillingReviews } from "@/db/schema";

const cust = (w: World, k: string): Ctx => ({
  orgId: w.customers[k].orgId,
  actor: { type: "customer", id: `portal:${k}`, customerId: w.customers[k].id },
});
const staff = (w: World, k: keyof World["users"]): Ctx => ({
  orgId: w.users[k].orgId,
  actor: { type: "operator", id: w.users[k].id, role: w.users[k].role },
});

export async function seedDemoCases(db: Db, w: World) {
  // 1) Priya — $149 charge: customer has not yet confirmed; approval will be needed afterwards.
  await openWorkflowCase(db, cust(w, "priya"), {
    workflowKey: "failed-cancellation-billing-recovery",
    customerId: w.customers.priya.id,
    title: "I cancelled but was charged again",
    description: "Chat said it was cancelled twelve days ago.",
    source: "portal",
  });

  // 2) Elena — nothing in the account supports an automatic fix: escalated with context; ana owns it.
  const elena = await openWorkflowCase(db, cust(w, "elena"), {
    workflowKey: "failed-cancellation-billing-recovery",
    customerId: w.customers.elena.id,
    title: "Charged and I don't recognise it",
    description: "I never signed up for this plan.",
    source: "portal",
  });
  const esc = await escalateCase(db, cust(w, "elena"), elena.id, {
    reason: "Please call me about this charge",
    reasonCode: "CUSTOMER_REQUEST",
    channel: "callback_request",
  });
  await takeOwnership(db, staff(w, "nfOperator"), esc.escalation.id).catch(() => undefined);

  // 3) Marcus — already cancelled but charged afterwards: review only, decided by a person, fully verified.
  const mCtx = cust(w, "marcus");
  const m = await openWorkflowCase(db, mCtx, {
    workflowKey: "failed-cancellation-billing-recovery",
    customerId: w.customers.marcus.id,
    title: "Charged after I cancelled",
    source: "portal",
  });
  const [req] = await actionsForCase(db, mCtx, m.id);
  await confirmAction(db, mCtx, req.id, true);
  await transitionCase(db, staff(w, "nfOperator"), m.id, {
    to: "READY_FOR_ACTION",
    message: "Ready to record the billing decision",
  });
  const [rv] = await db.select().from(simBillingReviews);
  await submitAction(db, staff(w, "nfOperator"), {
    caseId: m.id,
    operation: "billing.record_review_decision",
    input: { accountNumber: "NF-100555", chargeId: rv.chargeId, decision: "DENIED" },
    idempotencyKey: "seed-marcus-decision-0001",
  });
  await advance(db, staff(w, "nfOperator"), m.id);

  // 4) Sam — missed appointment, waiting for details from the customer.
  await openWorkflowCase(db, cust(w, "sam"), {
    workflowKey: "missed-appointment-recovery",
    customerId: w.customers.sam.id,
    title: "My service appointment was missed",
    source: "portal",
  });
}
