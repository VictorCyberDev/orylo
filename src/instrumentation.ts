export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.JOB_WORKER !== "off" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startWorker } = await import("./jobs/worker");
    startWorker();
  }
}
