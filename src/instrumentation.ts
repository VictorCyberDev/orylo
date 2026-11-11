export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV === "production") {
    const { assertProductionConfig } = await import("./lib/config");
    assertProductionConfig(); // throws → the server does not start with an unsafe configuration
  }
  // "off": no worker in this process. "request": serverless — jobs are drained by src/jobs/piggyback.ts + the cron tick.
  if (process.env.JOB_WORKER !== "off" && process.env.JOB_WORKER !== "request") {
    const { startWorker } = await import("./jobs/worker");
    startWorker();
  }
}
