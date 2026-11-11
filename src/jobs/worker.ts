/**
 * In-process worker started by `src/instrumentation.ts` when the Next.js server boots (disable with JOB_WORKER=off, e.g.
 * when running a dedicated `npm run worker` process or a platform cron calling /api/internal/jobs/tick). State is in the
 * database, so any number of instances can run this concurrently.
 */
import { logError } from "@/lib/log";
import { ensureMaintenance, runDueJobs } from "./runner";

const g = globalThis as unknown as { __oryloWorker?: NodeJS.Timeout; __oryloWorkerBusy?: boolean };

export async function workerTick() {
  if (g.__oryloWorkerBusy) return;
  g.__oryloWorkerBusy = true;
  try {
    await ensureMaintenance();
    let s = await runDueJobs({ limit: 10 });
    // drain a backlog without waiting for the next interval
    for (let i = 0; i < 5 && s.claimed === 10; i++) s = await runDueJobs({ limit: 10 });
  } catch (e) {
    logError("[worker tick]", e);
  } finally {
    g.__oryloWorkerBusy = false;
  }
}

export function startWorker(intervalMs = Number(process.env.JOB_POLL_MS ?? 5000)) {
  if (g.__oryloWorker) return;
  g.__oryloWorker = setInterval(() => void workerTick(), intervalMs);
  g.__oryloWorker.unref?.();
  console.info(JSON.stringify({ level: "info", msg: "job worker started", intervalMs }));
}
