/**
 * Regression tests for the findings of the independent security review (see docs/security/threat-model.md).
 * Each test reproduces the attack described and asserts it no longer works.
 */
import { PNG } from "../fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, freshWorld, op, cust, openRecoveryCase, caseState } from "../helpers";
import type { World } from "@/seed/world";
import type { Ctx } from "@/domain/context";
import {
  actionApprovals,
  actionRequests,
  caseEvents,
  caseEvidence,
  memberships,
  simBillingReviews,
} from "@/db/schema";
import {
  actionsForCase,
  confirmAction,
  executeAction,
  grantConsent,
  requestAction,
  submitAction,
} from "@/domain/actions";
import { escalateCase } from "@/domain/escalation";
import { addEvidence } from "@/domain/uploads";
import { findCase, listCases, transitionCase } from "@/domain/cases";
import { getCaseView } from "@/domain/case-view";
import { advance } from "@/workflows/engine";
import { createInvitation, deactivateMember } from "@/domain/admin";
import { createPolicyVersion } from "@/domain/policy";
import { signingKey } from "@/domain/crypto";
import { logError } from "@/lib/log";
import { clientIp } from "@/lib/ip";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});
const asReadOnly = (c: Ctx, caseScope?: string): Ctx => ({
  ...c,
  actor: { ...(c.actor as Extract<Ctx["actor"], { type: "customer" }>), readOnly: true, caseScope },
});

describe("F1 (HIGH): staff-issued links cannot consent for the customer", () => {
  it("a read-only customer actor can see the case but cannot consent, confirm, escalate, upload, or move it", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w, "jordan");
    const ro = asReadOnly(ctx);
    expect((await getCaseView(db, ro, row.id)).case.reference).toBe(row.reference); // can read
    const id = actions[0].id;
    await expect(grantConsent(db, ro, id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(confirmAction(db, ro, id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(escalateCase(db, ro, row.id, { reason: "x", reasonCode: "X" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      addEvidence(db, ro, row.id, { filename: "a.png", contentType: "image/png", bytes: PNG }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(transitionCase(db, ro, row.id, { to: "CANCELLED" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await db.select().from(actionApprovals)).toHaveLength(0);
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
    // …while the same person, signed in normally, can
    expect((await confirmAction(db, ctx, id, true)).status).toBe("EXECUTED");
  });
});

describe("F2: case-scoped links are enforced everywhere, not on one page", () => {
  it("a customer actor scoped to case A cannot list, read, or act on case B", async () => {
    const a = await openRecoveryCase(w, "jordan");
    const { openWorkflowCase } = await import("@/workflows/engine");
    const b = await openWorkflowCase(db, a.ctx, {
      workflowKey: "missed-appointment-recovery",
      customerId: w.customers.jordan.id,
      title: "other case",
    });
    const scoped = asReadOnly(a.ctx, a.row.id);
    expect((await listCases(db, scoped, {})).rows.map((r) => r.reference)).toEqual([a.row.reference]);
    await expect(findCase(db, scoped, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getCaseView(db, scoped, b.reference)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { getEvidenceFile } = await import("@/domain/uploads");
    const ev = await addEvidence(db, a.ctx, b.id, {
      filename: "r.png",
      contentType: "image/png",
      bytes: PNG,
    });
    await expect(getEvidenceFile(db, scoped, ev.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("F3: an admin cannot remove an owner", () => {
  it("only an owner may deactivate an owner", async () => {
    await db.update(memberships).set({ role: "owner" }).where(eq(memberships.userId, w.users.nfAdmin.id)); // 2 owners exist
    await db.update(memberships).set({ role: "admin" }).where(eq(memberships.userId, w.users.nfAdmin.id));
    await expect(deactivateMember(db, op(w, "nfAdmin"), w.users.nfOwner.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      createInvitation(db, op(w, "nfOwner"), "x@y.example", "superadmin" as never),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("F4: workflow advance requires access to the case", () => {
  it("a customer cannot advance (and thereby mutate) another customer's workflow", async () => {
    const victim = await openRecoveryCase(w, "marcus");
    const attacker = cust(w, "jordan");
    await expect(advance(db, attacker, victim.row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      advance(db, { orgId: w.orgs.ke, actor: attacker.actor }, victim.row.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("F5: billing decisions are bound to the case's own account", () => {
  it("an operator cannot decide another customer's review by passing a foreign chargeId", async () => {
    const a = await openRecoveryCase(w, "jordan");
    const p = await openRecoveryCase(w, "priya");
    await confirmAction(
      db,
      p.ctx,
      p.actions.find((x) => x.operation === "subscription.create_billing_review")!.id,
      true,
    );
    const { decideApproval } = await import("@/domain/actions");
    await decideApproval(
      db,
      op(w, "nfApprover"),
      p.actions.find((x) => x.operation === "subscription.create_billing_review")!.id,
      true,
    );
    await confirmAction(
      db,
      p.ctx,
      p.actions.find((x) => x.operation === "subscription.create_billing_review")!.id,
      true,
    );
    const [priyaReview] = await db.select().from(simBillingReviews);
    // Jordan's case, Jordan's account number, PRIYA's charge id
    await confirmAction(
      db,
      a.ctx,
      a.actions.find((x) => x.operation === "subscription.create_billing_review")!.id,
      true,
    );
    await confirmAction(
      db,
      a.ctx,
      a.actions.find((x) => x.operation === "subscription.correct_cancellation")!.id,
      true,
    );
    await transitionCase(db, op(w), a.row.id, { to: "READY_FOR_ACTION" });
    const r = await submitAction(db, op(w), {
      caseId: a.row.id,
      operation: "billing.record_review_decision",
      input: {
        accountNumber: "NF-100234",
        chargeId: priyaReview.chargeId,
        decision: "APPROVED_FOR_REFUND_PROCESSING",
      },
      idempotencyKey: "attack-foreign-charge-1",
    }).catch((e) => e);
    expect(r).toMatchObject({ code: "NOT_FOUND" });
    const reviews = await db.select().from(simBillingReviews);
    expect(reviews.find((x) => x.id === priyaReview.id)?.decision).toBeNull(); // Priya's review untouched
  });
});

describe("F13: consent is final and expires", () => {
  it("'no' after 'yes' can never run the action; 'yes' after 'no' cannot resurrect it", async () => {
    const { ctx, actions } = await openRecoveryCase(w, "jordan");
    const cancel = actions.find((x) => x.operation === "subscription.correct_cancellation")!;
    await grantConsent(db, ctx, cancel.id, true);
    await expect(confirmAction(db, ctx, cancel.id, false)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.select().from(actionRequests).where(eq(actionRequests.id, cancel.id)))[0].status).toBe(
      "APPROVED",
    ); // nothing ran
    const review = actions.find((x) => x.operation === "subscription.create_billing_review")!;
    await grantConsent(db, ctx, review.id, false);
    await expect(confirmAction(db, ctx, review.id, true)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("a confirmation older than 72 hours is refused", async () => {
    const { ctx, actions } = await openRecoveryCase(w, "jordan");
    const cancel = actions.find((x) => x.operation === "subscription.correct_cancellation")!;
    await grantConsent(db, ctx, cancel.id, true);
    await db.execute(sql`alter table action_approvals disable trigger all`);
    await db
      .update(actionApprovals)
      .set({ createdAt: new Date(Date.now() - 73 * 3_600_000) })
      .where(eq(actionApprovals.actionRequestId, cancel.id));
    await db.execute(sql`alter table action_approvals enable trigger all`);
    await expect(executeAction(db, ctx, cancel.id)).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
      message: expect.stringMatching(/expired/),
    });
  });
});

describe("F12: policy rules are typed and fail closed", () => {
  it("rejects malformed/unknown rules at authoring time", async () => {
    const mk = (rules: Record<string, unknown>) =>
      createPolicyVersion(db, op(w, "nfPolicy"), {
        documentKey: "billing-policy",
        body: "# B\n\n## S\nx",
        rules: rules as never,
      });
    await expect(mk({ "billing.review_window_days": "abc" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(mk({ "billing.review_window_days": -5 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(mk({ "billing.review_allowed": "yes" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(mk({ "totally.unknown": true })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(mk({ "custom.note": "ok" })).resolves.toBeDefined();
  });
  it("a malformed value that reaches the database is treated as MISSING authority (action refused), never as 'unlimited'", async () => {
    await db.execute(
      sql`update policy_versions set rules = jsonb_set(rules, '{billing.review_window_days}', '"abc"') where rules ? 'billing.review_window_days' and status = 'APPROVED'`,
    );
    const { row } = await openRecoveryCase(w, "jordan");
    expect(row.state).toBe("ESCALATED"); // cannot safely propose → person
  });
});

describe("F6/F8/F9/F18: logging, secrets, IP trust, receipts", () => {
  it("logError never prints bound parameters (PII/bytes)", () => {
    const seen: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => seen.push(a);
    logError(
      "[t]",
      new Error(
        "Failed query: insert into leads (email) values ($1)\nparams: secret@victim.example,TOPSECRETBYTES",
      ),
    );
    console.error = orig;
    const out = JSON.stringify(seen);
    expect(out).toContain("Failed query");
    expect(out).not.toMatch(/secret@victim|TOPSECRETBYTES/);
  });
  it("production refuses placeholder / short signing keys before any side effect", () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = [env.NODE_ENV, env.RECEIPT_SIGNING_KEY];
    try {
      env.NODE_ENV = "production";
      for (const bad of [
        undefined,
        "short",
        "change-me-dev-only-receipt-key",
        "x".repeat(40).replace(/x/g, "dev-only-"),
      ]) {
        env.RECEIPT_SIGNING_KEY = bad;
        expect(() => signingKey()).toThrow(/RECEIPT_SIGNING_KEY/);
      }
      env.RECEIPT_SIGNING_KEY = "k9Vq2mZp4Lx8Rt1Yb6Nc3Wd7Hs0Jf5Ga";
      expect(signingKey()).toHaveLength(32);
    } finally {
      env.NODE_ENV = prev[0];
      env.RECEIPT_SIGNING_KEY = prev[1];
    }
  });
  it("client IP trust is explicit: forwarded headers are ignored by default (see config-and-crypto unit test for hops)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4", "x-real-ip": "9.9.9.9" }))).toBe(
      "direct",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }), 1)).toBe("1.2.3.4");
  });
  it("receipt numbers carry 64 bits of the request hash", async () => {
    const { ctx, actions } = await openRecoveryCase(w, "jordan");
    const r = await confirmAction(db, ctx, actions[0].id, true);
    expect(r.receipt?.receiptNo).toMatch(/^RCPT-\d{8}-[A-F0-9]{16}$/);
  });
});

describe("F11/F14: quotas and customer-visible wording", () => {
  it("caps evidence per case", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    for (let i = 0; i < 10; i++)
      await addEvidence(db, ctx, row.id, { filename: `r${i}.png`, contentType: "image/png", bytes: PNG });
    await expect(
      addEvidence(db, ctx, row.id, { filename: "one-too-many.png", contentType: "image/png", bytes: PNG }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(caseEvidence)).toHaveLength(10);
  });
  it("a refused action tells the customer only fixed, safe wording (no internal rule keys)", async () => {
    const { ctx, actions, row } = await openRecoveryCase(w, "jordan");
    const cancel = actions.find((x) => x.operation === "subscription.correct_cancellation")!;
    await db.execute(
      sql`update policy_versions set rules = jsonb_set(rules, '{cancellation.correction_allowed}', 'false') where rules ? 'cancellation.correction_allowed' and status = 'APPROVED'`,
    );
    await grantConsent(db, ctx, cancel.id, true);
    await executeAction(db, ctx, cancel.id).catch(() => undefined);
    const view = await getCaseView(db, ctx, row.id);
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/cancellation\.correction_allowed|missing:|rule/i);
    const internal = await db
      .select()
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, row.id), eq(caseEvents.type, "action.refused")));
    expect(internal.length).toBeGreaterThan(0);
    expect(JSON.stringify(internal[0].payload)).toMatch(/detail/); // detail kept for staff
  });
});

describe("suspected: internal ops and idempotency-key races", () => {
  it("the same idempotency key from two cases/operations is rejected, not silently aliased", async () => {
    const a = await openRecoveryCase(w, "jordan");
    await requestAction(db, a.ctx, {
      caseId: a.row.id,
      operation: "subscription.correct_cancellation",
      input: { accountNumber: "NF-100234" },
      idempotencyKey: "shared-key-12345",
    });
    const m = await openRecoveryCase(w, "marcus");
    await expect(
      requestAction(db, m.ctx, {
        caseId: m.row.id,
        operation: "subscription.create_billing_review",
        input: { accountNumber: "NF-100555", chargeId: "11111111-1111-4111-8111-111111111111" },
        idempotencyKey: "shared-key-12345",
      }),
    ).rejects.toBeDefined();
  });
  it("actionsForCase for a customer never exposes input payloads, attempts or approver identities", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    const json = JSON.stringify(await actionsForCase(db, ctx, row.id));
    expect(json).not.toMatch(/"input"|"attempts"|"approvals"|requestedBy/);
  });
});
