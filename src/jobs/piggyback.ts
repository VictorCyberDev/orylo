import { after } from "next/server";
import { ensureMaintenance, runDueJobs } from "./runner";
import { logError } from "@/lib/log";

/**
 * Serverless worker (JOB_WORKER=request). Function instances freeze between requests, so an in-process timer cannot be
 * the worker there. Instead, durable jobs are drained by (1) work scheduled with `after()` on ordinary requests —
 * it runs once the response has been sent, so the user never waits for it — and (2) the cron/tick endpoint
 * (`/api/internal/jobs/tick`) called by a platform scheduler. Both only ever claim jobs that are DUE, using the same
 * SKIP LOCKED + lease queue as the dedicated worker, so any mix of workers is safe.
 *
 * Honest limit: with no traffic AND no scheduler, a due job waits until the next request or tick. Retry back-offs are
 * therefore "at least 15 s, usually the next request", not exact.
 */
const MIN_GAP_MS = 5_000;
let last = 0;

export function resetKickThrottle() {
  last = 0;
}

export function kickJobs(
  schedule: (cb: () => Promise<void>) => void = after,
  now: () => number = Date.now,
  mode: string | undefined = process.env.JOB_WORKER,
): boolean {
  if (mode !== "request") return false;
  const t = now();
  if (t - last < MIN_GAP_MS) return false;
  last = t;
  schedule(async () => {
    try {
      await ensureMaintenance();
      await runDueJobs({ limit: 5 });
    } catch (e) {
      logError("[job kick]", e);
    }
  });
  return true;
}
