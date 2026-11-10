import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, freshWorld, op, cust, acct, openRecoveryCase, caseState, setMode } from "../helpers";
import type { World } from "@/seed/world";
import {
  actionAttempts,
  actionReceipts,
  actionRequests,
  auditEvents,
  escalations,
  simOperations,
  simAccounts,
  outcomeLedger,
  caseEvents,
} from "@/db/schema";
import {
  actionsForCase,
  confirmAction,
  executeAction,
  grantConsent,
  requestAction,
  submitAction,
} from "@/domain/actions";
import { transitionCase } from "@/domain/cases";
import { AppError } from "@/domain/errors";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});
const cancelReq = (a: Awaited<ReturnType<typeof actionsForCase>>) =>
  a.find((x) => x.operation === "subscription.correct_cancellation")!;

describe("Scenario C — action denied: no mutation, understandable refusal, escalation still possible", () => {
  it("another customer cannot see, consent to, or run my action", async () => {
    const { row, actions } = await openRecoveryCase(w, "jordan");
    const marcus = cust(w, "marcus");
    await expect(grantConsent(db, marcus, cancelReq(actions).id, true)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(executeAction(db, marcus, cancelReq(actions).id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("ACTIVE");
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
  });

  it("a customer cannot run staff-only operations", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    const e = await requestAction(db, ctx, {
      caseId: row.id,
      operation: "billing.record_review_decision",
      input: {
        accountNumber: "NF-100234",
        chargeId: "11111111-1111-4111-8111-111111111111",
        decision: "APPROVED_FOR_REFUND_PROCESSING",
      },
      idempotencyKey: "cust-tries-staff-op",
    }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("FORBIDDEN");
    expect(
      await db.select().from(actionRequests).where(eq(actionRequests.idempotencyKey, "cust-tries-staff-op")),
    ).toHaveLength(0);
    const denials = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.outcome, "denied"), eq(auditEvents.action, "action.request")));
    expect(denials.length).toBeGreaterThan(0);
  });

  it("an analyst (no action.execute) is refused", async () => {
    const { row } = await openRecoveryCase(w, "jordan");
    await expect(
      requestAction(db, op(w, "nfAnalyst"), {
        caseId: row.id,
        operation: "subscription.correct_cancellation",
        input: { accountNumber: "NF-100234" },
        idempotencyKey: "analyst-attempt-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a customer cannot act on someone else's account number even inside their own case", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    // Marcus's account number, Jordan's case + consent
    const r = await requestAction(db, ctx, {
      caseId: row.id,
      operation: "subscription.correct_cancellation",
      input: { accountNumber: "NF-100555" },
      idempotencyKey: "cross-account-0001",
    }).catch((x) => x);
    expect(r).toBeInstanceOf(AppError);
    expect(r.code).toBe("NOT_FOUND"); // indistinguishable from a non-existent account
    expect((await acct(w.orgs.nf, "NF-100555")).status).toBe("CANCELLED");
  });

  it("unknown operations and malformed input are rejected before anything is stored", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    await expect(
      requestAction(db, ctx, {
        caseId: row.id,
        operation: "subscription.delete_everything",
        input: {},
        idempotencyKey: "bad-op-000001",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(
      requestAction(db, ctx, {
        caseId: row.id,
        operation: "subscription.correct_cancellation",
        input: { accountNumber: "NF-100234", extra: "x" },
        idempotencyKey: "bad-input-0001",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      requestAction(db, ctx, {
        caseId: row.id,
        operation: "subscription.correct_cancellation",
        input: { accountNumber: "NF-100234" },
        idempotencyKey: "x",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("execution without consent is refused (CONSENT_REQUIRED) and changes nothing", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    await expect(executeAction(db, ctx, cancelReq(actions).id)).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(1);
  });

  it("an operator cannot supply the customer's consent on their behalf", async () => {
    const { actions } = await openRecoveryCase(w);
    await expect(grantConsent(db, op(w), cancelReq(actions).id, true)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("escalation remains available after a refusal", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    const { escalateCase } = await import("@/domain/escalation");
    const r = await escalateCase(db, ctx, row.id, {
      reason: "I would rather speak to someone",
      reasonCode: "CUSTOMER_REQUEST",
      channel: "callback_request",
    });
    expect(r.created).toBe(true);
    expect((await caseState(row.id)).state).toBe("ESCALATED");
  });
});

describe("Scenario D — concurrent duplicate requests: exactly one mutation, one durable outcome", () => {
  it("5 simultaneous confirms of the same request → 1 mutation, 1 receipt, identical receipt in every response", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    const id = cancelReq(actions).id;
    const before = await acct(w.orgs.nf, "NF-100234");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => confirmAction(db, ctx, id, true).catch((e) => e)),
    );
    const ok = results.filter((r) => !(r instanceof Error));
    expect(ok).toHaveLength(5);
    expect(ok.filter((r) => r.status === "EXECUTED")).toHaveLength(1);
    expect(ok.filter((r) => r.status === "DUPLICATE")).toHaveLength(4);
    expect(new Set(ok.map((r) => r.receipt?.receiptNo)).size).toBe(1);
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(before.version + 1);
    expect(await db.select().from(actionReceipts)).toHaveLength(1);
    expect(await db.select().from(actionAttempts).where(eq(actionAttempts.actionRequestId, id))).toHaveLength(
      1,
    );
    const dup = await db.select().from(auditEvents).where(eq(auditEvents.action, "action.duplicate"));
    expect(dup).toHaveLength(4);
  });

  it("same idempotency key submitted concurrently by independent callers → one request, one mutation", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    // use the staff path (no consent needed) via a fresh case on Marcus for review-decision? Use customer path with same key on the already-proposed op.
    const key = "client-retry-key-0001";
    const calls = Array.from({ length: 6 }, () =>
      submitAction(db, ctx, {
        caseId: row.id,
        operation: "subscription.correct_cancellation",
        input: { accountNumber: "NF-100234" },
        idempotencyKey: key,
        consent: true,
      }).catch((e) => e),
    );
    const rs = await Promise.all(calls);
    expect(rs.filter((r) => r instanceof Error)).toHaveLength(0);
    expect(await db.select().from(actionRequests).where(eq(actionRequests.idempotencyKey, key))).toHaveLength(
      1,
    );
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(2);
    expect(new Set(rs.map((r) => (r as { receipt: { receiptNo: string } }).receipt.receiptNo)).size).toBe(1);
  });

  it("re-using a key for a DIFFERENT request is rejected (replay with altered payload)", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    await requestAction(db, ctx, {
      caseId: row.id,
      operation: "subscription.correct_cancellation",
      input: { accountNumber: "NF-100234" },
      idempotencyKey: "same-key-diff-payload",
    });
    await expect(
      requestAction(db, ctx, {
        caseId: row.id,
        operation: "subscription.create_billing_review",
        input: { accountNumber: "NF-100234", chargeId: "11111111-1111-4111-8111-111111111111" },
        idempotencyKey: "same-key-diff-payload",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("concurrent case transitions are serialized; exactly one wins and events stay gap-free", async () => {
    const { row } = await openRecoveryCase(w, "jordan");
    const rs = await Promise.all(
      [
        transitionCase(db, op(w), row.id, { to: "INVESTIGATING", expectedState: "READY_FOR_ACTION" }),
        transitionCase(db, op(w), row.id, { to: "ESCALATED", expectedState: "READY_FOR_ACTION" }),
        transitionCase(db, op(w), row.id, { to: "CANCELLED", expectedState: "READY_FOR_ACTION" }),
      ].map((p) => p.catch((e) => e)),
    );
    expect(rs.filter((r) => !(r instanceof Error))).toHaveLength(1);
    expect(rs.filter((r) => r instanceof AppError && r.code === "CONFLICT")).toHaveLength(2);
    const seqs = (
      await db
        .select({ s: caseEvents.seq })
        .from(caseEvents)
        .where(eq(caseEvents.caseId, row.id))
        .orderBy(caseEvents.seq)
    ).map((x) => x.s);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });
});

describe("external adapter failure modes", () => {
  it("failure: attempt recorded, nothing reported as done, safe to retry, then succeeds", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    const id = cancelReq(actions).id;
    await setMode(w.orgs.nf, "failure");
    const r = await confirmAction(db, ctx, id, true);
    expect(r.status).toBe("FAILED");
    expect(r.failure).toMatchObject({ code: "ADAPTER_FAILURE", retriable: true });
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("ACTIVE");
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
    const ledger = await db.select().from(outcomeLedger).where(eq(outcomeLedger.caseId, row.id));
    expect(ledger[0]).toMatchObject({ executionResult: "FAILED", finalOutcome: "FAILED" });

    await setMode(w.orgs.nf, "normal");
    const retry = await executeAction(db, ctx, id);
    expect(retry.status).toBe("EXECUTED");
    expect(retry.verification?.verified).toBe(true);
    const attempts = await db
      .select()
      .from(actionAttempts)
      .where(eq(actionAttempts.actionRequestId, id))
      .orderBy(actionAttempts.attemptNo);
    expect(attempts.map((a) => [a.attemptNo, a.status])).toEqual([
      [1, "FAILED"],
      [2, "SUCCEEDED"],
    ]);
  });

  it("repeated failure hits the policy limit (2) and escalates to a person with full context", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    const id = cancelReq(actions).id;
    await setMode(w.orgs.nf, "failure");
    expect((await confirmAction(db, ctx, id, true)).status).toBe("FAILED");
    const second = await executeAction(db, ctx, id);
    expect(second.status).toBe("FAILED");
    expect(second.failure?.retriable).toBe(false);
    expect((await caseState(row.id)).state).toBe("ESCALATED");
    const [e] = await db.select().from(escalations).where(eq(escalations.caseId, row.id));
    expect(e.reasonCode).toBe("ACTION_FAILED");
    const snap = e.contextSnapshot as { actions: { attempts: unknown[] }[]; objectives: unknown[] };
    expect(snap.actions.find((a) => a.attempts.length === 2)).toBeTruthy();
    expect(snap.objectives).toHaveLength(3);
  });

  it("delay (timeout after the provider applied it): safe retry replays — still exactly one mutation", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    const id = cancelReq(actions).id;
    await setMode(w.orgs.nf, "delay", 600); // ACTION_TIMEOUT_MS=150 in tests
    const r = await confirmAction(db, ctx, id, true);
    expect(r.status).toBe("FAILED");
    expect(r.failure?.code).toBe("ADAPTER_TIMEOUT");
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("CANCELLED"); // provider DID apply it; our response was lost
    await setMode(w.orgs.nf, "normal");
    const retry = await executeAction(db, ctx, id);
    expect(retry.status).toBe("EXECUTED");
    expect(retry.verification?.verified).toBe(true);
    expect((retry.receipt?.result as { status: string }).status).toBe("ALREADY_APPLIED");
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(2);
  });

  it("duplicate delivery at the provider is absorbed by provider-side idempotency", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    await setMode(w.orgs.nf, "duplicate");
    const r = await confirmAction(db, ctx, cancelReq(actions).id, true);
    expect(r.status).toBe("EXECUTED");
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(2);
    const [op1] = await db.select().from(simOperations);
    expect(op1.deliveries).toBe(2); // provider saw the key twice…
    expect(await db.select().from(simOperations)).toHaveLength(1); // …and applied once
  });

  it("stale state: provider changed under us → nothing applied, customer must re-confirm", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    await setMode(w.orgs.nf, "stale_state");
    const r = await confirmAction(db, ctx, cancelReq(actions).id, true);
    expect(r.status).toBe("FAILED");
    expect(r.failure?.code).toBe("STALE_STATE");
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("ACTIVE");
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
  });

  it("stale consent: account changed after the customer confirmed → refused before any write", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    const id = cancelReq(actions).id;
    await grantConsent(db, ctx, id, true);
    await db
      .update(simAccounts)
      .set({ version: sql`${simAccounts.version} + 1` })
      .where(eq(simAccounts.accountNumber, "NF-100234"));
    await expect(executeAction(db, ctx, id)).rejects.toMatchObject({ code: "STALE_STATE" });
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("ACTIVE");
    // and the stale confirmation cannot be reused
    await expect(executeAction(db, ctx, id)).rejects.toMatchObject({ code: "STALE_STATE" });
  });

  it("authorization denied by the provider → blocked + escalated, never success", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    await setMode(w.orgs.nf, "auth_denied");
    const r = await confirmAction(db, ctx, cancelReq(actions).id, true);
    expect(r.status).toBe("FAILED");
    expect(r.failure?.code).toBe("ADAPTER_DENIED");
    expect((await caseState(row.id)).state).toBe("ESCALATED");
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("ACTIVE");
  });

  it("an unavailable provider at the very start leaves a human-readable escalation, not a crash", async () => {
    await setMode(w.orgs.nf, "auth_denied");
    const { row } = await openRecoveryCase(w);
    // workflow lookup retries are non-retriable for denied → escalated
    expect(["ESCALATED"]).toContain((await caseState(row.id)).state);
  });
});
