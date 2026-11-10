import { lt, sql } from "drizzle-orm";
import { rateLimits } from "@/db/schema";
import type { DbOrTx } from "@/db";
import { AppError } from "./errors";

/** Fixed-window limiter in Postgres (works across serverless instances). Returns remaining quota or throws RATE_LIMITED. */
export async function rateLimit(db: DbOrTx, key: string, limit: number, windowSec: number) {
  // Opportunistic cleanup so the limiter table cannot grow without bound.
  if (Math.random() < 0.02)
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 86_400_000)));
  const bucket = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: bucket, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if (row.count > limit)
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.", {
      retryAfterSec: windowSec,
    });
  return { remaining: limit - row.count };
}
