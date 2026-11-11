import "./env";
import { runDueJobs, ensureMaintenance } from "../src/jobs/runner";
import { pool } from "../src/db";

/** Dedicated worker process: `npm run worker`. Safe to run alongside (or instead of) the in-process worker. */
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
async function main() {
  console.info(JSON.stringify({ level: "info", msg: "worker process started" }));
  while (!stopping) {
    await ensureMaintenance();
    const s = await runDueJobs({ limit: 10 });
    if (s.claimed < 10) await new Promise((r) => setTimeout(r, Number(process.env.JOB_POLL_MS ?? 5000)));
  }
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
