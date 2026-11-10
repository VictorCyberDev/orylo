import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, freshWorld, op, cust, acct, openRecoveryCase, caseState } from "../helpers";
import type { World } from "@/seed/world";
import { actionReceipts, caseObjectives, outcomeLedger, simBillingReviews, simCharges, auditEvents, caseEvents } from "@/db/schema";
import { actionsForCase, confirmAction, decideApproval, submitAction, verifyReceipt } from "@/domain/actions";
import { verifyChain } from "@/domain/ledger";
import { advance } from "@/workflows/engine";
import { getObjectives } from "@/domain/cases";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});

const reqFor = (actions: Awaited<ReturnType<typeof actionsForCase>>, op: string) => actions.find((a) => a.operation === op)!;

describe("Scenario A+B — failed cancellation: discover, consent, correct once, review separately, partial resolution", () => {
  it("runs the whole story with truthful state at every step", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);

    // workflow discovered the earlier request and the new charge, and stopped at consent — it did NOT act.
    expect(row.state).toBe("READY_FOR_ACTION");
    expect(actions.map((a) => a.operation).sort()).toEqual(["subscription.correct_cancellation", "subscription.create_billing_review"]);
    expect(actions.every((a) => a.status === "AWAITING_CONSENT")).toBe(true);
    const before = await acct(w.orgs.nf, "NF-100234");
    expect(before.status).toBe("ACTIVE"); // account remains active until consent

    // 1) cancellation correction
    const cancel = reqFor(actions, "subscription.correct_cancellation");
    const r1 = await confirmAction(db, ctx, cancel.id, true);
    expect(r1.status).toBe("EXECUTED");
    expect(r1.verification?.verified).toBe(true);
    expect(r1.receipt?.receiptNo).toMatch(/^RCPT-/);
    const after = await acct(w.orgs.nf, "NF-100234");
    expect(after.status).toBe("CANCELLED");
    expect(after.billingActive).toBe(false);
    expect(after.version).toBe(before.version + 1); // exactly one mutation

    // case is NOT resolved: billing review + disposition outstanding → back to ready for the next step
    let c = await caseState(row.id);
    expect(c.state).toBe("READY_FOR_ACTION");
    let objs = await getObjectives(db, w.orgs.nf, row.id);
    expect(Object.fromEntries(objs.map((o) => [o.key, o.status]))).toEqual({ stop_future_billing: "VERIFIED", billing_review_submitted: "PENDING", charge_disposition: "PENDING" });

    // 2) billing review (independent action, independently verified)
    const review = reqFor(await actionsForCase(db, ctx, row.id), "subscription.create_billing_review");
    const r2 = await confirmAction(db, ctx, review.id, true);
    expect(r2.status).toBe("EXECUTED");
    expect(r2.verification?.summary).toMatch(/No money has moved/);
    c = await caseState(row.id);
    expect(c.state).toBe("OUTCOME_PENDING_VERIFICATION"); // partial resolution — NOT resolved
    expect(c.closedAt).toBeNull();
    const reviews = await db.select().from(simBillingReviews).where(eq(simBillingReviews.organizationId, w.orgs.nf));
    expect(reviews).toHaveLength(1);
    expect(reviews[0].decision).toBeNull(); // review opened; nobody decided; no refund exists
    const [charge] = await db.select().from(simCharges).where(eq(simCharges.id, reviews[0].chargeId));
    expect(charge.status).toBe("UNDER_REVIEW");

    // a workflow advance must not resolve it either
    await advance(db, ctx, row.id);
    expect((await caseState(row.id)).state).toBe("OUTCOME_PENDING_VERIFICATION");

    // 3) the billing team's decision (human, operator-only) completes the last objective
    const decision = await submitAction(db, op(w), { caseId: row.id, operation: "billing.record_review_decision", input: { accountNumber: "NF-100234", chargeId: reviews[0].chargeId, decision: "APPROVED_FOR_REFUND_PROCESSING" }, idempotencyKey: "decision-jordan-0001" }).catch((e) => e);
    // case was not READY_FOR_ACTION so the gateway refuses until an operator readies it — safe default
    expect(decision).toBeInstanceOf(Error);
    expect((decision as Error).message).toMatch(/READY_FOR_ACTION/);
  });

  it("completes: operator readies the case, records the decision, and only then is it VERIFIED_RESOLVED with a valid ledger chain", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    await confirmAction(db, ctx, reqFor(actions, "subscription.correct_cancellation").id, true);
    await confirmAction(db, ctx, reqFor(await actionsForCase(db, ctx, row.id), "subscription.create_billing_review").id, true);
    const { transitionCase } = await import("@/domain/cases");
    await transitionCase(db, op(w), row.id, { to: "READY_FOR_ACTION", message: "Ready to record the billing decision" });
    const [rv] = await db.select().from(simBillingReviews);
    const res = await submitAction(db, op(w), { caseId: row.id, operation: "billing.record_review_decision", input: { accountNumber: "NF-100234", chargeId: rv.chargeId, decision: "APPROVED_FOR_REFUND_PROCESSING" }, idempotencyKey: "decision-jordan-0002" });
    expect(res.status).toBe("EXECUTED");
    expect(res.verification?.summary).toMatch(/does not move money/);
    const c = await caseState(row.id);
    expect(c.state).toBe("VERIFIED_RESOLVED");
    expect(c.closedAt).not.toBeNull();

    // ledger: every consequential step recorded, chain verifies, customer view hides internals
    const ledger = await db.select().from(outcomeLedger).where(eq(outcomeLedger.caseId, row.id));
    expect(ledger.map((l) => l.finalOutcome)).toEqual(["VERIFIED", "VERIFIED", "VERIFIED"]);
    expect((await verifyChain(db, w.orgs.nf)).ok).toBe(true);
    const { customerLedgerView } = await import("@/domain/ledger");
    const view = customerLedgerView(ledger[0]) as Record<string, unknown>;
    expect(Object.keys(view)).not.toContain("executor");
    expect(Object.keys(view)).not.toContain("authorizationRef");
    expect(Object.keys(view)).not.toContain("evidence");

    // receipts are independently verifiable; tampering is detected
    const [rcpt] = await db.select().from(actionReceipts).where(eq(actionReceipts.organizationId, w.orgs.nf));
    expect((await verifyReceipt(db, rcpt.receiptNo)).valid).toBe(true);
    await db.update(actionReceipts).set({ result: { summary: "forged" } }).where(eq(actionReceipts.id, rcpt.id));
    expect((await verifyReceipt(db, rcpt.receiptNo)).valid).toBe(false);

    // audit trail has the full sequence
    const audits = (await db.select().from(auditEvents).where(eq(auditEvents.organizationId, w.orgs.nf))).map((a) => a.action);
    for (const a of ["case.create", "action.request", "action.consent", "action.execute", "case.transition"]) expect(audits).toContain(a);
  });
});

describe("incorrect-success prevention", () => {
  it("cannot be moved to VERIFIED_RESOLVED without ledger evidence, even by direct SQL", async () => {
    const { row } = await openRecoveryCase(w);
    await expect(db.execute(sql`update resolution_cases set state = 'VERIFIED_RESOLVED' where id = ${row.id}`)).rejects.toThrow(/verified outcome evidence|VERIFIED_RESOLVED/);
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
  });

  it("when read-after-write disagrees the action is reported UNVERIFIED and escalated, never as success", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    // Sabotage the provider so the write "succeeds" but the account still reads ACTIVE: flip back inside an after-hook is not possible,
    // so emulate a provider that silently ignores the write by making the mutation a no-op on replay of a foreign key.
    const { simOperations, simAccounts } = await import("@/db/schema");
    const { sha256Hex } = await import("@/domain/crypto");
    const cancel = reqFor(actions, "subscription.correct_cancellation");
    const key = sha256Hex(`${w.orgs.nf}:${cancel.id}`).slice(0, 32);
    // The provider already "processed" this key earlier (replay) but the account is still ACTIVE → read-after-write must catch it.
    await db.insert(simOperations).values({ organizationId: w.orgs.nf, externalKey: key, operation: "correct_cancellation", result: { externalRef: "SUB-OP-GHOST", detail: { accountNumber: "NF-100234" }, replayed: false } });
    const r = await confirmAction(db, ctx, cancel.id, true);
    expect(r.status).toBe("EXECUTED");
    expect(r.verification?.verified).toBe(false);
    const [a] = await db.select().from(simAccounts).where(eq(simAccounts.accountNumber, "NF-100234"));
    expect(a.status).toBe("ACTIVE");
    const c = await caseState(row.id);
    expect(c.state).toBe("ESCALATED");
    const objs = await getObjectives(db, w.orgs.nf, row.id);
    expect(objs.find((o) => o.key === "stop_future_billing")?.status).toBe("COMPLETED"); // executed, NOT verified
    const [l] = await db.select().from(outcomeLedger).where(and(eq(outcomeLedger.caseId, row.id)));
    expect(l.finalOutcome).toBe("UNVERIFIED");
  });
});

describe("approval threshold", () => {
  it("a charge above the threshold needs a team member's approval before the review opens", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w, "priya");
    const review = reqFor(actions, "subscription.create_billing_review");
    expect(review.amountCents).toBe(14_900);
    const r = await confirmAction(db, ctx, review.id, true);
    expect(r.status).toBe("AWAITING_APPROVAL");
    expect((await caseState(row.id)).state).toBe("AWAITING_APPROVAL");
    expect(await db.select().from(simBillingReviews)).toHaveLength(0); // nothing happened yet

    // analysts and the customer cannot approve
    await expect(decideApproval(db, op(w, "nfAnalyst"), review.id, true)).rejects.toThrow();
    await expect(decideApproval(db, ctx, review.id, true)).rejects.toThrow();

    const ok = await decideApproval(db, op(w, "nfApprover"), review.id, true, "Within policy");
    expect(ok.decision).toBe("GRANTED");
    const done = await confirmAction(db, ctx, review.id, true);
    expect(done.status).toBe("EXECUTED");
    expect(await db.select().from(simBillingReviews)).toHaveLength(1);
  });

  it("a declined approval keeps the case safe: nothing runs", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w, "priya");
    const review = reqFor(actions, "subscription.create_billing_review");
    await confirmAction(db, ctx, review.id, true);
    await decideApproval(db, op(w, "nfApprover"), review.id, false, "Needs more evidence");
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
    expect(await db.select().from(simBillingReviews)).toHaveLength(0);
    await expect(confirmAction(db, ctx, review.id, true)).rejects.toThrow(/denied/i);
  });
});

describe("customer declines (journey 4)", () => {
  it("changes nothing and leaves the case actionable", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    const r = await confirmAction(db, ctx, reqFor(actions, "subscription.correct_cancellation").id, false);
    expect(r.status).toBe("DECLINED");
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("ACTIVE");
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
    const ev = await db.select().from(caseEvents).where(eq(caseEvents.caseId, row.id));
    expect(ev.some((e) => e.type === "action.declined")).toBe(true);
  });
});

describe("objectives are independent (no single resolved boolean)", () => {
  it("tracks each objective's status separately", async () => {
    const { row } = await openRecoveryCase(w);
    const objs = await db.select().from(caseObjectives).where(eq(caseObjectives.caseId, row.id));
    expect(objs.map((o) => o.key).sort()).toEqual(["billing_review_submitted", "charge_disposition", "stop_future_billing"]);
    expect(objs.every((o) => o.status === "PENDING")).toBe(true);
  });
});
