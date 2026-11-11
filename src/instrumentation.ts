export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV === "production") {
    const { assertProductionConfig } = await import("./lib/config");
    assertProductionConfig(); // throws → the server does not start with an unsafe configuration
  }
  if (process.env.JOB_WORKER !== "off") {
    const { startWorker } = await import("./jobs/worker");
    startWorker();
  }
}
