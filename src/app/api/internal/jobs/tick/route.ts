import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ensureMaintenance, runDueJobs } from "@/jobs/runner";
import { handle, json } from "@/lib/api";
import { AppError } from "@/domain/errors";

export const dynamic = "force-dynamic";

/**
 * For platform schedulers (cron) when no always-on worker exists. Disabled (404) unless CRON_SECRET is set; the secret is
 * compared in constant time. Idempotent: running it any number of times only processes jobs that are due.
 */
async function tick(req: NextRequest) {
  return handle(req, async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    const want = Buffer.from(secret);
    if (given.length !== want.length || !timingSafeEqual(given, want))
      throw new AppError("UNAUTHENTICATED", "Invalid credentials");
    await ensureMaintenance();
    const stats = await runDueJobs({ limit: 25 });
    return json({ ok: true, ...stats });
  });
}

/** POST for manual/other schedulers; GET because Vercel Cron issues GET (it sends `Authorization: Bearer $CRON_SECRET`). */
export const POST = tick;
export const GET = tick;
