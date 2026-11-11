import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, freshWorld, op, cust, acct, openRecoveryCase, caseState, setMode } from "../helpers";
import type { World } from "@/seed/world";
import {
  actionRequests,
  auditEvents,
  caseEvidence,
  escalations,
  notifications,
  resolutionCases,
  scheduledJobs,
  workflowExecutions,
} from "@/db/schema";
import {
  backoffMs,
  claimDueJobs,
  completeJob,
  enqueueJob,
  failJob,
  jobStats,
  requeueDead,
} from "@/jobs/queue";
import { runDueJobs } from "@/jobs/runner";
import { expireStaleConsents, purgeRetention, runMaintenance } from "@/jobs/maintenance";
import { actionsForCase, confirmAction } from "@/domain/actions";
import { addEvidence } from "@/domain/uploads";
import { BUILTIN_WORKFLOWS } from "@/workflows/definitions";
import { publishWorkflowVersion, saveWorkflowDraft } from "@/domain/admin";
import { openWorkflowCase } from "@/workflows/engine";
import { transitionCase } from "@/domain/cases";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});
const jobs = () => db.select().from(scheduledJobs);
const dueNow = (where = sql`true`) =>
  db
    .update(scheduledJobs)
    .set({ runAt: new Date(Date.now() - 1000) })
    .where(and(eq(scheduledJobs.status, "PENDING"), where));
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

describe("queue mechanics", () => {
  it("enqueue is idempotent by dedupe key; future jobs are not claimed", async () => {
    const a = await enqueueJob(db, { kind: "maintenance.tick", dedupeKey: "k1" });
    const b = await enqueueJob(db, { kind: "maintenance.tick", dedupeKey: "k1" });
    expect([a.enqueued, b.enqueued]).toEqual([true, false]);
    await enqueueJob(db, {
      kind: "maintenance.tick",
      dedupeKey: "later",
      runAt: new Date(Date.now() + 3_600_000),
    });
    const claimed = await claimDueJobs(db, "w1", 10);
    expect(claimed).toHaveLength(1);
    expect((await jobs()).find((j) => j.dedupeKey === "later")?.status).toBe("PENDING");
  });

  it("concurrent workers never run the same job twice (SKIP LOCKED): 30 jobs, 6 workers → each exactly once", async () => {
    for (let i = 0; i < 30; i++)
      await enqueueJob(db, { kind: "maintenance.tick", dedupeKey: `c-${i}`, payload: { i } });
    const seen: number[] = [];
    const handler = async (j: { payload: Record<string, unknown> }) => {
      seen.push(Number(j.payload.i));
      await new Promise((r) => setTimeout(r, 5));
    };
    const stats = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        runDueJobs({ workerId: `w${n}`, limit: 5, handlers: { "maintenance.tick": handler } }).then(
          async (s) => {
            // keep draining like a real worker loop
            let t = s;
            while (t.claimed > 0)
              t = await runDueJobs({
                workerId: `w${n}`,
                limit: 5,
                handlers: { "maintenance.tick": handler },
              });
            return s;
          },
        ),
      ),
    );
    expect(stats.length).toBe(6);
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30); // no duplicates
    expect((await jobs()).every((j) => j.status === "SUCCEEDED" && j.attempts === 1)).toBe(true);
  });

  it("failure → backoff → retry → DEAD after max attempts; audited; admins notified; operator can requeue", async () => {
    await enqueueJob(db, {
      orgId: w.orgs.nf,
      kind: "workflow.advance",
      payload: { caseId: "x" },
      maxAttempts: 3,
      dedupeKey: "boom",
    });
    const boom = {
      "workflow.advance": async () => {
        throw new Error("provider exploded\nparams: secret@victim.example");
      },
    };
    const s1 = await runDueJobs({ handlers: boom });
    expect(s1).toMatchObject({ claimed: 1, retried: 1, dead: 0 });
    let [j] = await jobs();
    expect(j.status).toBe("PENDING");
    expect(j.runAt.getTime()).toBeGreaterThan(Date.now() + 5_000); // backed off, not immediate
    expect(j.lastError).toBe("provider exploded"); // params (PII) never stored
    expect((await runDueJobs({ handlers: boom })).claimed).toBe(0); // not due yet
    await dueNow();
    expect((await runDueJobs({ handlers: boom })).retried).toBe(1);
    await dueNow();
    const last = await runDueJobs({ handlers: boom });
    expect(last).toMatchObject({ dead: 1 });
    [j] = await jobs();
    expect(j).toMatchObject({ status: "DEAD", attempts: 3 });
    expect((await runDueJobs({ handlers: boom })).claimed).toBe(0); // dead jobs are not retried forever
    expect((await db.select().from(auditEvents).where(eq(auditEvents.action, "job.dead"))).length).toBe(1);
    expect(
      (
        await db.select().from(notifications).where(eq(notifications.recipientUserId, w.users.nfOwner.id))
      ).some((n) => /background job/i.test(n.title)),
    ).toBe(true);
    expect((await jobStats(db)).dead).toBe(1);
    expect(await requeueDead(db, j.id, w.orgs.ke)).toBe(false); // other tenant cannot requeue
    expect(await requeueDead(db, j.id, w.orgs.nf)).toBe(true);
    expect((await jobs())[0]).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("a crashed worker's job is reclaimed after its lease expires, and the dead worker cannot settle it late", async () => {
    await enqueueJob(db, { kind: "maintenance.tick", dedupeKey: "lease" });
    const [first] = await claimDueJobs(db, "crasher", 1, 60_000);
    expect(await claimDueJobs(db, "other", 1)).toHaveLength(0); // lease still held
    await db.update(scheduledJobs).set({ lockedUntil: new Date(Date.now() - 1000) }); // worker died
    const [second] = await claimDueJobs(db, "rescuer", 1);
    expect(second.id).toBe(first.id);
    expect(second.attempts).toBe(2);
    expect(await completeJob(db, first, "crasher")).toBe(false); // stale holder refused
    expect((await failJob(db, first, "crasher", "late")).settled).toBe(false);
    expect(await completeJob(db, second, "rescuer")).toBe(true);
    expect((await jobs())[0].status).toBe("SUCCEEDED");
  });

  it("backoff grows and is capped", () => {
    expect(backoffMs(1)).toBeGreaterThanOrEqual(12_000);
    expect(backoffMs(3)).toBeGreaterThan(backoffMs(1));
    expect(backoffMs(30)).toBeLessThanOrEqual(36 * 60_000);
  });
});

describe("autonomous recovery of actions (no human invokes anything)", () => {
  it("transient provider failure schedules a retry; the worker completes and verifies it", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    const cancel = actions.find((a) => a.operation === "subscription.correct_cancellation")!;
    await setMode(w.orgs.nf, "failure");
    expect((await confirmAction(db, ctx, cancel.id, true)).status).toBe("FAILED");
    const retry = (await jobs()).filter((j) => j.kind === "action.retry");
    expect(retry).toHaveLength(1);
    expect(retry[0].dedupeKey).toBe(`action-retry:${cancel.id}:1`);
    await setMode(w.orgs.nf, "normal"); // provider recovers
    await dueNow();
    const stats = await runDueJobs();
    expect(stats.succeeded).toBeGreaterThanOrEqual(1);
    const [req] = await db.select().from(actionRequests).where(eq(actionRequests.id, cancel.id));
    expect(req.status).toBe("SUCCEEDED");
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("CANCELLED");
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(2); // exactly one mutation
    expect((await caseState(row.id)).state).toBe("READY_FOR_ACTION"); // billing review still to confirm
  });

  it("timeout-after-apply: the scheduled retry REPLAYS (no double application)", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    const cancel = actions.find((a) => a.operation === "subscription.correct_cancellation")!;
    await setMode(w.orgs.nf, "delay", 600);
    expect((await confirmAction(db, ctx, cancel.id, true)).failure?.code).toBe("ADAPTER_TIMEOUT");
    await setMode(w.orgs.nf, "normal");
    await dueNow();
    await runDueJobs();
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(2);
    expect((await db.select().from(actionRequests).where(eq(actionRequests.id, cancel.id)))[0].status).toBe(
      "SUCCEEDED",
    );
  });

  it("retry exhaustion: persistent outage stops retrying, escalates to a person, and enqueues no further jobs", async () => {
    const { ctx, row, actions } = await openRecoveryCase(w);
    const cancel = actions.find((a) => a.operation === "subscription.correct_cancellation")!;
    await setMode(w.orgs.nf, "failure");
    await confirmAction(db, ctx, cancel.id, true); // attempt 1 → retry job
    await dueNow();
    await runDueJobs(); // attempt 2 by the worker → policy limit (2) reached
    expect((await caseState(row.id)).state).toBe("ESCALATED");
    expect((await db.select().from(escalations).where(eq(escalations.caseId, row.id)))[0].reasonCode).toBe(
      "ACTION_FAILED",
    );
    expect((await jobs()).filter((j) => j.kind === "action.retry" && j.status === "PENDING")).toHaveLength(0);
    await dueNow();
    expect((await runDueJobs()).claimed).toBe(0);
  });

  it("a worker retry racing a human confirm still produces exactly one mutation", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    const cancel = actions.find((a) => a.operation === "subscription.correct_cancellation")!;
    await setMode(w.orgs.nf, "failure");
    await confirmAction(db, ctx, cancel.id, true);
    await setMode(w.orgs.nf, "normal");
    await dueNow();
    await Promise.all([
      runDueJobs({ workerId: "a" }),
      runDueJobs({ workerId: "b" }),
      confirmAction(db, ctx, cancel.id, true).catch(() => undefined),
    ]);
    expect((await acct(w.orgs.nf, "NF-100234")).version).toBe(2);
    expect(
      await db
        .select()
        .from(actionRequests)
        .where(and(eq(actionRequests.id, cancel.id), eq(actionRequests.status, "SUCCEEDED"))),
    ).toHaveLength(1);
  });

  it("a terminal domain refusal (consent expired) ends the job cleanly instead of retrying forever", async () => {
    const { ctx, actions } = await openRecoveryCase(w);
    const cancel = actions.find((a) => a.operation === "subscription.correct_cancellation")!;
    await setMode(w.orgs.nf, "failure");
    await confirmAction(db, ctx, cancel.id, true);
    await setMode(w.orgs.nf, "normal");
    await db.execute(sql`alter table action_approvals disable trigger all`);
    await db.execute(sql`update action_approvals set created_at = now() - interval '5 days'`);
    await db.execute(sql`alter table action_approvals enable trigger all`);
    await dueNow();
    const s = await runDueJobs();
    expect(s.dead).toBe(0);
    expect(s.retried).toBe(0);
    expect((await acct(w.orgs.nf, "NF-100234")).status).toBe("ACTIVE"); // never acted without valid consent
  });
});

describe("autonomous workflow timeouts", () => {
  it("an await node with a timeout schedules its own wake-up; the worker escalates when nothing happened", async () => {
    const spec = structuredClone(BUILTIN_WORKFLOWS[0]);
    (spec.nodes.find((n) => n.id === "wait_outcomes") as { timeoutHours: number }).timeoutHours = 0.00001;
    const v = await saveWorkflowDraft(db, op(w, "nfPolicy"), spec);
    await publishWorkflowVersion(db, op(w, "nfApprover"), v.id);
    const row = await openWorkflowCase(db, cust(w, "jordan"), {
      workflowKey: spec.key,
      customerId: w.customers.jordan.id,
      title: "timeout case",
    });
    const wake = (await jobs()).filter((j) => j.kind === "workflow.advance");
    expect(wake).toHaveLength(1);
    expect(wake[0].dedupeKey).toMatch(/^wf-timeout:/);
    await new Promise((r) => setTimeout(r, 150));
    await dueNow();
    await runDueJobs();
    const [exec] = await db.select().from(workflowExecutions).where(eq(workflowExecutions.caseId, row.id));
    expect(exec.status).toBe("COMPLETED");
    expect((await caseState(row.id)).state).toBe("ESCALATED");
    expect((await db.select().from(escalations).where(eq(escalations.caseId, row.id)))[0].reasonCode).toBe(
      "TIMEOUT",
    );
  });

  it("re-advancing a waiting case does not pile up duplicate wake-up jobs", async () => {
    const { advance } = await import("@/workflows/engine");
    const { row } = await openRecoveryCase(w);
    for (let i = 0; i < 4; i++) await advance(db, op(w), row.id);
    expect((await jobs()).filter((j) => j.kind === "workflow.advance")).toHaveLength(1);
  });
});

describe("expiry and retention lifecycle", () => {
  it("a proposal nobody answers within 7 days expires and the case goes to a person (no silent limbo)", async () => {
    const { row, actions } = await openRecoveryCase(w);
    await db.update(actionRequests).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) });
    expect(await expireStaleConsents(db)).toBe(2);
    expect(await expireStaleConsents(db)).toBe(0); // idempotent
    const reqs = await db.select().from(actionRequests);
    expect(reqs.every((r) => r.status === "CANCELLED" && r.failureCode === "CONSENT_EXPIRED")).toBe(true);
    expect((await caseState(row.id)).state).toBe("ESCALATED");
    expect(actions.length).toBe(2);
  });

  it("retention deletes uploads only for cases closed longer ago than the org's retention window", async () => {
    const a = await openRecoveryCase(w, "jordan");
    const b = await openRecoveryCase(w, "marcus");
    await addEvidence(db, a.ctx, a.row.id, { filename: "a.png", contentType: "image/png", bytes: PNG });
    await addEvidence(db, b.ctx, b.row.id, { filename: "b.png", contentType: "image/png", bytes: PNG });
    await transitionCase(db, a.ctx, a.row.id, { to: "CANCELLED" });
    await db
      .update(resolutionCases)
      .set({ closedAt: new Date(Date.now() - 400 * 86_400_000) })
      .where(eq(resolutionCases.id, a.row.id)); // > 365 d
    const r = await purgeRetention(db);
    expect(r.evidence).toBe(1);
    const left = await db.select().from(caseEvidence);
    expect(left).toHaveLength(1);
    expect(left[0].caseId).toBe(b.row.id); // open case untouched
    expect((await purgeRetention(db)).evidence).toBe(0); // idempotent
    // the append-only history is NOT purged by retention
    expect((await db.select().from(auditEvents)).length).toBeGreaterThan(0);
  });

  it("runMaintenance runs end to end and is safe to repeat", async () => {
    await openRecoveryCase(w);
    const r1 = await runMaintenance(db);
    const r2 = await runMaintenance(db);
    expect(r1.swept).toBeGreaterThanOrEqual(1);
    expect(r2.expiredConsents).toBe(0);
  });
});
