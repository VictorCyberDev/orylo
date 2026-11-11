import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json } from "@/lib/api";
import { jobStats } from "@/jobs/queue";
import { kickJobs } from "@/jobs/piggyback";
export const dynamic = "force-dynamic";

/** Liveness + readiness. Returns 503 only when the database is unreachable; stuck/dead jobs degrade the reported status. */
export async function GET() {
  kickJobs(); // an uptime monitor pinging /api/health also keeps the durable queue moving on serverless hosts
  try {
    await db.execute(sql`select 1`);
  } catch {
    return json({ status: "down", db: "down" }, 503);
  }
  const jobs = await jobStats(db).catch(() => null);
  const degraded = !!jobs && (jobs.dead > 0 || jobs.oldestDueSeconds > 15 * 60);
  return json({ status: degraded ? "degraded" : "ok", db: "up", jobs });
}
