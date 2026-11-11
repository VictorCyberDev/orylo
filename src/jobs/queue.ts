/**
 * Durable job queue (PostgreSQL). Design:
 *  - enqueue is idempotent via `dedupe_key` (unique when present);
 *  - claim uses `FOR UPDATE SKIP LOCKED` + a lease, so N workers/instances never run the same job concurrently and a
 *    crashed worker's job is reclaimed once its lease expires;
 *  - failure → exponential backoff with jitter → DEAD after `max_attempts` (visible in Admin → Background jobs, audited,
 *    and notified to admins). Handlers MUST be idempotent: delivery is at-least-once.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { scheduledJobs } from "@/db/schema";
import type { DbOrTx } from "@/db";

export type JobKind = "workflow.advance" | "action.retry" | "maintenance.tick";

export interface EnqueueInput {
  orgId?: string | null;
  kind: JobKind;
  payload?: Record<string, unknown>;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
}

export async function enqueueJob(db: DbOrTx, i: EnqueueInput) {
  const [row] = await db
    .insert(scheduledJobs)
    .values({
      organizationId: i.orgId ?? null,
      kind: i.kind,
      payload: i.payload ?? {},
      runAt: i.runAt ?? new Date(),
      dedupeKey: i.dedupeKey,
      maxAttempts: i.maxAttempts ?? 5,
    })
    .onConflictDoNothing()
    .returning({ id: scheduledJobs.id });
  return { enqueued: !!row, id: row?.id ?? null };
}

/** 15 s, 30 s, 60 s … capped at 30 min, ±20 % jitter. */
export function backoffMs(attempt: number) {
  const base = Math.min(15_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export interface ClaimedJob {
  id: string;
  orgId: string | null;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export async function claimDueJobs(
  db: DbOrTx,
  workerId: string,
  limit = 10,
  leaseMs = 60_000,
): Promise<ClaimedJob[]> {
  const res = await db.execute<{
    id: string;
    organization_id: string | null;
    kind: JobKind;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>(sql`
    update scheduled_jobs j
       set status = 'RUNNING', attempts = j.attempts + 1, locked_by = ${workerId},
           locked_until = now() + (${leaseMs}::int * interval '1 millisecond'), started_at = now()
     where j.id in (
       select id from scheduled_jobs
        where (status = 'PENDING' and run_at <= now()) or (status = 'RUNNING' and locked_until < now())
        order by run_at
        limit ${limit}
        for update skip locked)
    returning j.id, j.organization_id, j.kind, j.payload, j.attempts, j.max_attempts`);
  return res.rows.map((r) => ({
    id: r.id,
    orgId: r.organization_id,
    kind: r.kind,
    payload: r.payload,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
  }));
}

/** Only the worker that still holds the lease may settle the job (a reclaimed job is not double-settled). */
export async function completeJob(db: DbOrTx, job: ClaimedJob, workerId: string) {
  const r = await db
    .update(scheduledJobs)
    .set({ status: "SUCCEEDED", finishedAt: new Date(), lockedBy: null, lockedUntil: null, lastError: null })
    .where(
      and(
        eq(scheduledJobs.id, job.id),
        eq(scheduledJobs.status, "RUNNING"),
        eq(scheduledJobs.lockedBy, workerId),
      ),
    )
    .returning({ id: scheduledJobs.id });
  return r.length > 0;
}

export async function failJob(db: DbOrTx, job: ClaimedJob, workerId: string, error: string) {
  const dead = job.attempts >= job.maxAttempts;
  const r = await db
    .update(scheduledJobs)
    .set(
      dead
        ? {
            status: "DEAD",
            finishedAt: new Date(),
            lockedBy: null,
            lockedUntil: null,
            lastError: error.slice(0, 500),
          }
        : {
            status: "PENDING",
            runAt: new Date(Date.now() + backoffMs(job.attempts)),
            lockedBy: null,
            lockedUntil: null,
            lastError: error.slice(0, 500),
          },
    )
    .where(
      and(
        eq(scheduledJobs.id, job.id),
        eq(scheduledJobs.status, "RUNNING"),
        eq(scheduledJobs.lockedBy, workerId),
      ),
    )
    .returning({ id: scheduledJobs.id });
  return { settled: r.length > 0, dead };
}

export async function requeueDead(db: DbOrTx, id: string, orgId: string) {
  const r = await db
    .update(scheduledJobs)
    .set({ status: "PENDING", attempts: 0, runAt: new Date(), lastError: null, finishedAt: null })
    .where(
      and(
        eq(scheduledJobs.id, id),
        eq(scheduledJobs.status, "DEAD"),
        eq(scheduledJobs.organizationId, orgId),
      ),
    )
    .returning({ id: scheduledJobs.id });
  return r.length > 0;
}

export async function jobStats(db: DbOrTx) {
  const r = await db.execute<{
    pending: number;
    running: number;
    dead: number;
    oldest_due_s: number | null;
  }>(sql`
    select count(*) filter (where status = 'PENDING')::int as pending,
           count(*) filter (where status = 'RUNNING')::int as running,
           count(*) filter (where status = 'DEAD')::int as dead,
           extract(epoch from (now() - min(run_at) filter (where status = 'PENDING' and run_at <= now())))::int as oldest_due_s
      from scheduled_jobs`);
  const x = r.rows[0];
  return {
    pending: x?.pending ?? 0,
    running: x?.running ?? 0,
    dead: x?.dead ?? 0,
    oldestDueSeconds: x?.oldest_due_s ?? 0,
  };
}

export async function recentJobs(db: DbOrTx, orgId: string, limit = 50) {
  return db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        inArray(scheduledJobs.status, ["PENDING", "RUNNING", "SUCCEEDED", "DEAD"]),
        eq(scheduledJobs.organizationId, orgId),
      ),
    )
    .orderBy(sql`${scheduledJobs.createdAt} desc`)
    .limit(limit);
}
