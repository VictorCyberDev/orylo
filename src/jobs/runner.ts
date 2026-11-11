import { randomUUID } from "node:crypto";
import { db as rootDb, type DbOrTx } from "@/db";
import { AppError } from "@/domain/errors";
import { systemCtx } from "@/domain/context";
import { audit } from "@/domain/audit";
import { notifyRoles } from "@/domain/notifications";
import { advance } from "@/workflows/engine";
import { executeAction } from "@/domain/actions";
import { logError } from "@/lib/log";
import { claimDueJobs, completeJob, enqueueJob, failJob, type ClaimedJob, type JobKind } from "./queue";
import { runMaintenance } from "./maintenance";

export const MAINTENANCE_EVERY_MS = 5 * 60_000;

type Handler = (job: ClaimedJob) => Promise<void>;
export const HANDLERS: Record<JobKind, Handler> = {
  "workflow.advance": async (j) => {
    if (!j.orgId) throw new Error("workflow.advance needs an organization");
    await advance(rootDb, systemCtx(j.orgId, "worker"), String(j.payload.caseId));
  },
  "action.retry": async (j) => {
    if (!j.orgId) throw new Error("action.retry needs an organization");
    try {
      await executeAction(rootDb, systemCtx(j.orgId, "worker"), String(j.payload.requestId));
    } catch (e) {
      // A domain refusal (consent expired, state changed, policy replaced, case moved on) is a TERMINAL, correct outcome
      // — retrying it would never help. Infrastructure errors propagate and are retried with backoff.
      if (e instanceof AppError) return;
      throw e;
    }
  },
  "maintenance.tick": async () => {
    const r = await runMaintenance(rootDb);
    console.info(JSON.stringify({ level: "info", msg: "maintenance", ...r }));
  },
};

/** Exactly one maintenance job per 5-minute bucket across ALL instances (dedupe key). */
export async function ensureMaintenance(db: DbOrTx = rootDb, now = Date.now()) {
  const bucket = Math.floor(now / MAINTENANCE_EVERY_MS);
  return enqueueJob(db, { kind: "maintenance.tick", dedupeKey: `maintenance:${bucket}`, maxAttempts: 3 });
}

export interface RunStats {
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
}

export async function runDueJobs(
  opts: {
    db?: DbOrTx;
    workerId?: string;
    limit?: number;
    leaseMs?: number;
    handlers?: Partial<Record<JobKind, Handler>>;
  } = {},
): Promise<RunStats> {
  const db = opts.db ?? rootDb;
  const workerId = opts.workerId ?? `w-${randomUUID().slice(0, 8)}`;
  const handlers = { ...HANDLERS, ...opts.handlers };
  const jobs = await claimDueJobs(db, workerId, opts.limit ?? 10, opts.leaseMs ?? 60_000);
  const stats: RunStats = { claimed: jobs.length, succeeded: 0, retried: 0, dead: 0 };
  for (const job of jobs) {
    const t0 = Date.now();
    try {
      await handlers[job.kind](job);
      if (await completeJob(db, job, workerId)) stats.succeeded++;
      console.info(
        JSON.stringify({
          level: "info",
          msg: "job.ok",
          kind: job.kind,
          id: job.id,
          attempt: job.attempts,
          ms: Date.now() - t0,
        }),
      );
    } catch (e) {
      const message = String((e as Error)?.message ?? e).split(/\n?params:/)[0];
      const r = await failJob(db, job, workerId, message);
      if (r.dead) {
        stats.dead++;
        logError("[job dead]", e, { kind: job.kind, id: job.id });
        if (job.orgId) {
          await audit(
            db,
            { orgId: job.orgId, actor: { type: "system", id: "worker" } },
            {
              action: "job.dead",
              targetType: "job",
              targetId: job.id,
              outcome: "error",
              metadata: { kind: job.kind, attempts: job.attempts },
            },
          ).catch(() => undefined);
          await notifyRoles(db, {
            orgId: job.orgId,
            roles: ["owner", "admin"],
            type: "action_failed",
            title: "A background job failed permanently",
            body: `${job.kind} gave up after ${job.attempts} attempts. See Admin → Background jobs.`,
          }).catch(() => undefined);
        }
      } else {
        stats.retried++;
        logError("[job retry]", e, { kind: job.kind, id: job.id, attempt: job.attempts });
      }
    }
  }
  return stats;
}
