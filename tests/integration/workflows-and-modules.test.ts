import { PNG } from "../fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, freshWorld, op, cust, caseState } from "../helpers";
import type { World } from "@/seed/world";
import {
  caseEvidence,
  escalations,
  invitations,
  leads,
  memberships,
  apiKeys,
  rateLimits,
  users,
  subscriptions,
} from "@/db/schema";
import { openWorkflowCase, provideInfo, advance, executionView } from "@/workflows/engine";
import { actionsForCase, confirmAction, submitAction } from "@/domain/actions";
import { addEvidence, validateUpload } from "@/domain/uploads";
import { escalateCase, resolveEscalation, takeOwnership, escalationsForCase } from "@/domain/escalation";
import { computeAnalytics, dashboardSummary } from "@/domain/analytics";
import {
  acceptInvitation,
  authenticateApiKey,
  changeMemberRole,
  createApiKey,
  createInvitation,
  deactivateMember,
  publishWorkflowVersion,
  revokeApiKey,
  saveWorkflowDraft,
  setSimulatorMode,
} from "@/domain/admin";
import { changePlan, billingOverview } from "@/domain/billing";
import { submitLead } from "@/domain/leads";
import { createEgainSession, resolveGrant, channelCtx } from "@/domain/channel";
import { BUILTIN_WORKFLOWS } from "@/workflows/definitions";
import { transitionCase } from "@/domain/cases";
import { listForUser, listForCustomer } from "@/domain/notifications";
import { openRecoveryCase } from "../helpers";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});

describe("Workflow 2 — Missed Service Appointment Recovery (internal steps; no scheduling system)", () => {
  it("collects details → proposes → hands to scheduling queue → human-confirmed slot → verified resolved", async () => {
    const ctx = cust(w, "sam");
    const row = await openWorkflowCase(db, ctx, {
      workflowKey: "missed-appointment-recovery",
      customerId: w.customers.sam.id,
      title: "Technician never showed up",
    });
    expect(row.state).toBe("AWAITING_CUSTOMER_INFORMATION");
    // invalid details are rejected with a clear message and change nothing
    await expect(
      provideInfo(db, ctx, row.id, {
        appointmentDate: "not-a-date",
        preferredWindows: "Tue morning",
        contactMethod: "email",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await caseState(row.id)).state).toBe("AWAITING_CUSTOMER_INFORMATION");
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await provideInfo(db, ctx, row.id, {
      appointmentDate: past,
      preferredWindows: "Tuesday morning\nThursday after 3pm",
      contactMethod: "email",
    });
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
    const [req] = await actionsForCase(db, ctx, row.id);
    expect(req.operation).toBe("internal.create_reschedule_request");
    const r = await confirmAction(db, ctx, req.id, true);
    expect(r.status).toBe("EXECUTED");
    expect(r.verification?.summary).toMatch(/A person will confirm/);
    // NOT resolved: a person must confirm the slot
    expect((await caseState(row.id)).state).not.toBe("VERIFIED_RESOLVED");
    const handoff = await db.select().from(escalations).where(eq(escalations.caseId, row.id));
    expect(handoff).toHaveLength(1);
    expect(handoff[0].reasonCode).toBe("RESCHEDULE_REQUEST");
    // operator readies the case and records the confirmed slot
    await transitionCase(db, op(w), row.id, { to: "READY_FOR_ACTION" });
    const done = await submitAction(db, op(w), {
      caseId: row.id,
      operation: "internal.confirm_reschedule",
      input: { newSlot: "Thu 19 Nov, 15:00–17:00" },
      idempotencyKey: "confirm-slot-0001",
    });
    expect(done.status).toBe("EXECUTED");
    await advance(db, op(w), row.id); // callers resume the workflow after an action
    expect((await caseState(row.id)).state).toBe("VERIFIED_RESOLVED");
    const view = await executionView(db, op(w), row.id);
    expect(view?.status).toBe("COMPLETED");
  });

  it("a future appointment is not 'missed' → safe handoff, no action proposed", async () => {
    const ctx = cust(w, "sam");
    const row = await openWorkflowCase(db, ctx, {
      workflowKey: "missed-appointment-recovery",
      customerId: w.customers.sam.id,
      title: "Appointment problem",
    });
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await provideInfo(db, ctx, row.id, {
      appointmentDate: future,
      preferredWindows: "Tuesday morning",
      contactMethod: "phone",
    });
    expect((await caseState(row.id)).state).toBe("ESCALATED");
    expect(await actionsForCase(db, ctx, row.id)).toHaveLength(0);
  });
});

describe("Workflow 3 — Warranty Claim Readiness", () => {
  it("needs proof of purchase; validates upload; assembles packet; hands to claims; never claims external submission", async () => {
    const ctx = cust(w, "sam");
    const row = await openWorkflowCase(db, ctx, {
      workflowKey: "warranty-claim-readiness",
      customerId: w.customers.sam.id,
      title: "Device stopped working",
    });
    expect(row.state).toBe("AWAITING_CUSTOMER_INFORMATION");
    const bought = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10);
    await provideInfo(db, ctx, row.id, {
      serialNumber: "SN-48213-XY",
      purchaseDate: bought,
      issue: "The box restarts every few minutes.",
    });
    expect((await caseState(row.id)).state).toBe("AWAITING_CUSTOMER_INFORMATION"); // proof still missing
    await addEvidence(db, ctx, row.id, { filename: "receipt.png", contentType: "image/png", bytes: PNG });
    await advance(db, ctx, row.id);
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION");
    const [req] = await actionsForCase(db, ctx, row.id);
    const r = await confirmAction(db, ctx, req.id, true);
    expect(r.verification?.verified).toBe(true);
    expect(r.verification?.summary).toMatch(/has not been submitted externally/);
    expect((await caseState(row.id)).state).toBe("VERIFIED_RESOLVED");
    await advance(db, ctx, row.id);
    const view = await executionView(db, ctx, row.id);
    expect(view?.status).toBe("COMPLETED");
  });

  it("outside the 12-month warranty window the action is refused with a clear reason", async () => {
    const ctx = cust(w, "sam");
    const row = await openWorkflowCase(db, ctx, {
      workflowKey: "warranty-claim-readiness",
      customerId: w.customers.sam.id,
      title: "Old device",
    });
    await addEvidence(db, ctx, row.id, { filename: "receipt.png", contentType: "image/png", bytes: PNG });
    const old = new Date(Date.now() - 500 * 86_400_000).toISOString().slice(0, 10);
    await provideInfo(db, ctx, row.id, {
      serialNumber: "SN-00001-AB",
      purchaseDate: old,
      issue: "Stopped working last week.",
    });
    expect((await caseState(row.id)).state).toBe("ESCALATED"); // proposal refused by policy → person
  });
});

describe("uploads", () => {
  it("accepts a real PNG; rejects renamed executables, wrong types, oversize, empty, traversal names", async () => {
    const ctx = cust(w, "sam");
    const row = await openWorkflowCase(db, ctx, {
      workflowKey: "warranty-claim-readiness",
      customerId: w.customers.sam.id,
      title: "x",
    });
    expect(
      (
        await addEvidence(db, ctx, row.id, {
          filename: "../../etc/passwd.png",
          contentType: "image/png",
          bytes: PNG,
        })
      ).filename,
    ).toBe("passwd.png");
    expect(() => validateUpload("evil.png", "image/png", Buffer.from("MZ\x90\x00 this is an exe"))).toThrow(
      /do not match/,
    );
    expect(() => validateUpload("evil.exe", "application/octet-stream", Buffer.from("MZ"))).toThrow(
      /PNG, JPEG, PDF/,
    );
    expect(() =>
      validateUpload(
        "big.pdf",
        "application/pdf",
        Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(2 * 1024 * 1024)]),
      ),
    ).toThrow(/2 MB/);
    expect(() => validateUpload("empty.txt", "text/plain", Buffer.alloc(0))).toThrow(/empty/);
    expect(() => validateUpload("note.txt", "text/plain", Buffer.from([65, 0, 66]))).toThrow(/do not match/);
    expect(() => validateUpload("a.jpg", "image/png", PNG)).toThrow(/does not match its type/);
    await expect(
      addEvidence(db, cust(w, "marcus"), row.id, { filename: "x.png", contentType: "image/png", bytes: PNG }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(caseEvidence)).toHaveLength(1);
  });
});

describe("Scenario E — human escalation preserves context and is a real record", () => {
  it("customer asks for a callback → tracked escalation with queue/status; operator takes ownership; customer sees it", async () => {
    const a = await openRecoveryCase(w, "elena"); // no earlier cancellation → no safe automatic action
    expect(a.row.state).toBe("ESCALATED");
    const [esc] = await db.select().from(escalations).where(eq(escalations.caseId, a.row.id));
    expect(esc.status).toBe("OPEN");
    expect(esc.reasonCode).toBe("NO_SAFE_ACTION");
    const snap = esc.contextSnapshot as { objectives: unknown[]; recentEvents: { type: string }[] };
    expect(snap.objectives).toHaveLength(3);
    expect(snap.recentEvents.some((e) => e.type === "diagnosis.completed")).toBe(true);

    const cb = await escalateCase(db, a.ctx, a.row.id, {
      reason: "Please call me",
      reasonCode: "CUSTOMER_REQUEST",
      channel: "callback_request",
    });
    expect(cb.created).toBe(true);
    expect(
      (
        await escalateCase(db, a.ctx, a.row.id, {
          reason: "Please call me",
          reasonCode: "CUSTOMER_REQUEST",
          channel: "callback_request",
        })
      ).created,
    ).toBe(false); // idempotent

    const before = await escalationsForCase(db, a.ctx, a.row.id);
    expect(JSON.stringify(before)).not.toMatch(/contextSnapshot|reasonCode/); // customer-safe view
    expect(before.every((e) => "status" in e && !("ownerUserId" in e))).toBe(true);

    // a non-operator cannot take ownership; an operator can; a second operator cannot steal it
    await expect(takeOwnership(db, a.ctx, esc.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(takeOwnership(db, op(w, "nfAnalyst"), esc.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const owned = await takeOwnership(db, op(w), esc.id);
    expect(owned.status).toBe("IN_PROGRESS");
    await expect(takeOwnership(db, op(w, "nfOperator2"), esc.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const after = await escalationsForCase(db, a.ctx, a.row.id);
    expect(after.find((e) => e.id === esc.id)).toMatchObject({ status: "IN_PROGRESS", hasOwner: true });
    const notes = await listForCustomer(db, a.ctx.orgId, w.customers.elena.id);
    expect(notes.some((n) => n.type === "escalation_updated")).toBe(true);

    // human returns control to automation (authorised operator only)
    const res = await resolveEscalation(
      db,
      op(w),
      esc.id,
      "Checked billing system manually; customer was never subscribed to cancel.",
      true,
    );
    expect(res.status).toBe("RETURNED_TO_AUTOMATION");
    expect((await caseState(a.row.id)).state).toBe("INVESTIGATING");
  });
});

describe("analytics are computed from stored records", () => {
  it("counts reflect actual cases/actions; filtering by workflow and org works; savings are labelled as a model", async () => {
    const a = await openRecoveryCase(w, "jordan");
    await openRecoveryCase(w, "elena");
    await confirmAction(
      db,
      a.ctx,
      a.actions.find((x) => x.operation === "subscription.correct_cancellation")!.id,
      true,
    );
    const an = await computeAnalytics(db, op(w, "nfAnalyst"));
    expect(an.measured.cases.total).toBe(2);
    expect(an.measured.cases.open).toBe(2);
    expect(an.measured.cases.verifiedResolved).toBe(0);
    expect(an.measured.cases.partiallyResolved).toBe(1); // Jordan: one objective verified, case not resolved
    expect(an.measured.actions.succeeded).toBe(1);
    expect(an.measured.humanEscalationRatePct).toBe(50);
    expect(an.measured.cases.synthetic).toBe(2);
    expect(an.estimatedSavings.kind).toBe("illustrative-model");
    expect(an.estimatedSavings.verifiedObjectives).toBe(1);
    const wf = await computeAnalytics(db, op(w, "nfAnalyst"), { workflowKey: "missed-appointment-recovery" });
    expect(wf.measured.cases.total).toBe(0);
    const empty = await computeAnalytics(db, op(w, "keOwner"));
    expect(empty.measured.cases.total).toBe(0);
    expect(empty.measured.actions.completionRatePct).toBeNull();
    await expect(computeAnalytics(db, a.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      computeAnalytics(
        db,
        op(w, "nfPolicy").actor.type === "operator"
          ? { ...op(w, "nfPolicy"), actor: { type: "operator", id: "x", role: "policy_manager" } }
          : op(w),
      ),
    ).resolves.toBeDefined();
    const s = await dashboardSummary(db, op(w));
    expect(s.open).toBe(2);
    expect(s.openEscalations).toBe(1);
  });
});

describe("admin: roles, invitations, API keys, workflow versioning", () => {
  it("invitations expire, are single-use, bound to the invited email; last owner is protected", async () => {
    const owner = op(w, "nfOwner");
    const { token, invitation } = await createInvitation(
      db,
      owner,
      "new.hire@northfield.example",
      "operator",
      72,
    );
    expect(
      (await db.select().from(invitations).where(eq(invitations.id, invitation.id)))[0].tokenHash,
    ).not.toBe(token); // only hash stored
    await expect(
      acceptInvitation(db, token, { id: "usr_other", email: "someone.else@x.example" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.insert(users).values({ id: "usr_new", name: "New Hire", email: "new.hire@northfield.example" });
    await acceptInvitation(db, token, { id: "usr_new", email: "new.hire@northfield.example" });
    expect((await db.select().from(memberships).where(eq(memberships.userId, "usr_new")))[0].role).toBe(
      "operator",
    );
    await expect(
      acceptInvitation(db, token, { id: "usr_new", email: "new.hire@northfield.example" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const expired = await createInvitation(db, owner, "late@northfield.example", "analyst", -1);
    await expect(
      acceptInvitation(db, expired.token, { id: "usr_new", email: "late@northfield.example" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createInvitation(db, op(w, "nfOperator"), "x@y.example", "operator")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createInvitation(db, op(w, "nfAdmin"), "boss@y.example", "owner")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(changeMemberRole(db, owner, w.users.nfOwner.id, "admin")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(deactivateMember(db, owner, w.users.nfOwner.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      changeMemberRole(db, op(w, "nfAdmin"), w.users.nfOperator.id, "owner"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("API keys: shown once, stored hashed, scoped, revocable, entitlement-gated", async () => {
    const owner = op(w, "nfOwner");
    await expect(createApiKey(db, op(w, "keOwner"), "eGain", ["egain:actions"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    }); // Kestrel's Pilot plan has no API access
    const { secret, key } = await createApiKey(db, owner, "eGain agent", ["egain:actions"]);
    expect(secret.startsWith("oryk_")).toBe(true);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.id));
    expect(row.keyHash).not.toBe(secret);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(await authenticateApiKey(db, secret, "egain:actions")).toMatchObject({ orgId: w.orgs.nf });
    await expect(authenticateApiKey(db, secret, "cases:read")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authenticateApiKey(db, "oryk_nope", "egain:actions")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(createApiKey(db, op(w, "nfOperator"), "x", ["egain:actions"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await revokeApiKey(db, owner, key.id);
    await expect(authenticateApiKey(db, secret, "egain:actions")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(revokeApiKey(db, op(w, "keOwner"), key.id)).rejects.toMatchObject({ code: "NOT_FOUND" }); // other tenant
  });

  it("workflow authoring is validated and versioned; publish requires a different person than the author", async () => {
    const spec = structuredClone(BUILTIN_WORKFLOWS[1]);
    spec.name = "Missed Service Appointment Recovery (v2 draft)";
    const bad = structuredClone(spec);
    (bad.nodes.find((n) => n.id === "propose") as { next: string }).next = "does_not_exist";
    await expect(saveWorkflowDraft(db, op(w, "nfPolicy"), bad)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveWorkflowDraft(db, op(w, "nfOperator"), spec)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const v = await saveWorkflowDraft(db, op(w, "nfPolicy"), spec);
    expect(v.version).toBe(2);
    await expect(publishWorkflowVersion(db, op(w, "nfPolicy"), v.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const p = await publishWorkflowVersion(db, op(w, "nfApprover"), v.id);
    expect(p.status).toBe("PUBLISHED");
    const ctx = cust(w, "sam");
    const row = await openWorkflowCase(db, ctx, {
      workflowKey: "missed-appointment-recovery",
      customerId: w.customers.sam.id,
      title: "uses v2",
    });
    expect(row.workflowVersionId).toBe(v.id);
    const old = await openWorkflowCase(db, ctx, {
      workflowKey: "warranty-claim-readiness",
      customerId: w.customers.sam.id,
      title: "still v1",
    });
    expect(old.workflowVersionId).toBe(w.workflowVersions["warranty-claim-readiness"]);
  });

  it("billing is test-mode only; plan change creates a test invoice; usage derives from records", async () => {
    const owner = op(w, "nfOwner");
    const a = await openRecoveryCase(w, "jordan");
    await confirmAction(
      db,
      a.ctx,
      a.actions.find((x) => x.operation === "subscription.correct_cancellation")!.id,
      true,
    );
    const o = await billingOverview(db, owner);
    expect(o.subscription.testMode).toBe(true);
    expect(o.usage.verifiedOutcomes).toBe(1);
    expect(o.plan.experimental).toBe(true);
    await expect(changePlan(db, op(w, "nfAdmin"), "scale")).rejects.toMatchObject({ code: "FORBIDDEN" }); // admin lacks billing.manage
    await changePlan(db, owner, "team");
    const o2 = await billingOverview(db, owner);
    expect(o2.invoices[0]).toMatchObject({ status: "test_paid", testMode: true, amountCents: 49_000 });
    expect((await db.select().from(subscriptions))[0].provider).toBe("test_billing");
  });

  it("only integration managers may switch the simulator mode", async () => {
    await expect(setSimulatorMode(db, op(w, "nfOperator"), "failure")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await setSimulatorMode(db, op(w, "nfAdmin"), "failure");
    await expect(setSimulatorMode(db, op(w, "nfAdmin"), "chaos" as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("marketing lead capture", () => {
  it("validates, persists, rate limits, and silently drops honeypot submissions", async () => {
    await expect(submitLead(db, { name: "A", email: "bad" }, { ip: "1.1.1.1" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const ok = await submitLead(
      db,
      {
        name: "Riley Chen",
        email: "Riley@Example.com",
        company: "Acme",
        useCase: "subscription_billing",
        message: "Hello",
      },
      { ip: "1.1.1.1" },
    );
    expect(ok.ok).toBe(true);
    expect((await db.select().from(leads))[0].email).toBe("riley@example.com");
    const bot = await submitLead(
      db,
      { name: "Bot", email: "bot@x.example", website: "http://spam" },
      { ip: "2.2.2.2" },
    );
    expect(bot).toEqual({ ok: true, id: null });
    expect(await db.select().from(leads)).toHaveLength(1);
    for (let i = 0; i < 4; i++)
      await submitLead(db, { name: "Riley Chen", email: `r${i}@example.com` }, { ip: "1.1.1.1" });
    await expect(
      submitLead(db, { name: "Riley Chen", email: "r9@example.com" }, { ip: "1.1.1.1" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect((await db.select().from(rateLimits)).length).toBeGreaterThan(0);
  });
});

describe("eGain channel session (identity verification before any case access)", () => {
  it("wrong email or account → generic failure, no case, no token; right details → case + scoped short-lived token", async () => {
    const key = { orgId: w.orgs.nf, keyId: "key-1" };
    const bad = await createEgainSession(db, key, {
      fullName: "Jordan Reyes",
      email: "attacker@evil.example",
      accountNumber: "NF-100234",
      issue: "charged twice",
    });
    expect(bad).toMatchObject({ verified: false });
    expect(JSON.stringify(bad)).not.toMatch(/ORY-|token/i);
    const ghost = await createEgainSession(db, key, {
      fullName: "X",
      email: "jordan.reyes@customer.example",
      accountNumber: "NF-999999",
      issue: "charged twice",
    });
    expect((ghost as { message: string }).message).toBe((bad as { message: string }).message); // indistinguishable
    // Marcus's email against Jordan's account number must fail too
    expect(
      await createEgainSession(db, key, {
        fullName: "M",
        email: "marcus.bell@customer.example",
        accountNumber: "NF-100234",
        issue: "x",
      }),
    ).toMatchObject({ verified: false });

    const good = await createEgainSession(db, key, {
      fullName: "Jordan Reyes",
      email: "Jordan.Reyes@customer.example",
      accountNumber: "NF-100234",
      issue: "I cancelled but was charged again",
    });
    expect(good).toMatchObject({ verified: true, state: "READY_FOR_ACTION", resumed: false });
    if (!good.verified) throw new Error("unreachable");
    const g = await resolveGrant(db, good.customerToken, w.orgs.nf);
    expect(g.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    const ctx = channelCtx(g);
    const a = await actionsForCase(db, ctx, g.caseId!);
    const r = await confirmAction(
      db,
      ctx,
      a.find((x) => x.operation === "subscription.correct_cancellation")!.id,
      true,
    );
    expect(r.status).toBe("EXECUTED");
    // same customer again → resumes the same case (never start over)
    const again = await createEgainSession(db, key, {
      fullName: "Jordan Reyes",
      email: "jordan.reyes@customer.example",
      accountNumber: "NF-100234",
      issue: "again",
    });
    expect(again).toMatchObject({ verified: true, resumed: true, caseReference: good.caseReference });
    // the channel actor cannot touch another customer's case
    const other = await openRecoveryCase(w, "marcus");
    await expect(confirmAction(db, ctx, other.actions[0].id, true)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // token from org A is useless against org B
    await expect(resolveGrant(db, good.customerToken, w.orgs.ke)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(resolveGrant(db, "garbage-token")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("brute force on the verification endpoint is rate limited", async () => {
    const key = { orgId: w.orgs.nf, keyId: "key-2" };
    for (let i = 0; i < 6; i++)
      await createEgainSession(db, key, {
        fullName: "x",
        email: "jordan.reyes@customer.example",
        accountNumber: `NF-10000${i}`,
        issue: "x",
      });
    await expect(
      createEgainSession(db, key, {
        fullName: "x",
        email: "jordan.reyes@customer.example",
        accountNumber: "NF-100234",
        issue: "x",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("notifications are durable and honest", () => {
  it("creates in-app notifications for approval, info, completion; email is never reported as sent", async () => {
    const a = await openRecoveryCase(w, "priya");
    await confirmAction(
      db,
      a.ctx,
      a.actions.find((x) => x.operation === "subscription.create_billing_review")!.id,
      true,
    );
    const ops = await listForUser(db, w.orgs.nf, w.users.nfApprover.id);
    expect(ops.some((n) => n.type === "approval_required")).toBe(true);
    const cs = await listForCustomer(db, w.orgs.nf, w.customers.priya.id);
    expect(cs.some((n) => n.type === "consent_requested")).toBe(true);
    // enable email for org + customer: row is recorded as SKIPPED with a reason, not DELIVERED
    const { organizations, customers } = await import("@/db/schema");
    await db
      .update(organizations)
      .set({
        settings: {
          retentionDays: 365,
          approvalThresholdCents: 5000,
          emailNotifications: true,
          auditRetentionDays: 730,
        },
      })
      .where(eq(organizations.id, w.orgs.nf));
    await db
      .update(customers)
      .set({ preferences: { notifyEmail: true, notifyInApp: true } })
      .where(eq(customers.id, w.customers.priya.id));
    const { notifyCustomer } = await import("@/domain/notifications");
    await notifyCustomer(db, {
      orgId: w.orgs.nf,
      customerId: w.customers.priya.id,
      type: "action_completed",
      title: "x",
    });
    const email = (await listForCustomer(db, w.orgs.nf, w.customers.priya.id)).find(
      (n) => n.channel === "email",
    );
    expect(email?.deliveryStatus).toBe("SKIPPED");
    expect(email?.deliveryDetail).toMatch(/not sent/i);
    void and;
  });
});
