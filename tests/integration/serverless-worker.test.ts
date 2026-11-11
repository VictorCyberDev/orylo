import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, freshWorld } from "../helpers";
import { scheduledJobs } from "@/db/schema";
import { enqueueJob } from "@/jobs/queue";
import { kickJobs, resetKickThrottle } from "@/jobs/piggyback";

beforeEach(async () => {
  await freshWorld();
  resetKickThrottle();
});

describe("serverless worker (JOB_WORKER=request)", () => {
  it("is inert unless explicitly enabled, so the dedicated worker and tests are unaffected", () => {
    let scheduled = 0;
    expect(kickJobs(() => void scheduled++, Date.now, undefined)).toBe(false);
    expect(kickJobs(() => void scheduled++, Date.now, "off")).toBe(false);
    expect(kickJobs(() => void scheduled++, Date.now, "on")).toBe(false);
    expect(scheduled).toBe(0);
  });

  it("schedules post-response work that drains a DUE durable job, and never a future one", async () => {
    await enqueueJob(db, { kind: "maintenance.tick", dedupeKey: "due-now" });
    await enqueueJob(db, {
      kind: "maintenance.tick",
      dedupeKey: "later",
      runAt: new Date(Date.now() + 3_600_000),
    });
    await db
      .update(scheduledJobs)
      .set({ runAt: new Date(Date.now() - 1000) })
      .where(eq(scheduledJobs.dedupeKey, "due-now"));
    let work: (() => Promise<void>) | undefined;
    expect(kickJobs((cb) => void (work = cb), Date.now, "request")).toBe(true);
    expect(work).toBeDefined();
    await work!();
    const rows = await db.select().from(scheduledJobs);
    expect(rows.find((r) => r.dedupeKey === "due-now")?.status).toBe("SUCCEEDED");
    expect(rows.find((r) => r.dedupeKey === "later")?.status).toBe("PENDING");
  });

  it("is throttled: a burst of requests schedules at most one drain per 5 seconds", () => {
    let n = 0;
    let t = 1_000_000;
    const run = () =>
      kickJobs(
        () => void n++,
        () => t,
        "request",
      );
    expect([run(), run(), run()]).toEqual([true, false, false]);
    t += 5_001;
    expect(run()).toBe(true);
    expect(n).toBe(2);
  });

  it("a failing drain is contained (never throws into the request that triggered it)", async () => {
    let work: (() => Promise<void>) | undefined;
    kickJobs((cb) => void (work = cb), Date.now, "request");
    await db.execute(sql`select 1`);
    await expect(work!()).resolves.toBeUndefined();
  });
});
