import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return json({ status: "ok", db: "up" });
  } catch {
    return json({ status: "degraded", db: "down" }, 503);
  }
}
