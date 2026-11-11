import { NextResponse } from "next/server";
import { db } from "@/db";
import { getCustomer } from "@/auth/session";
import { exportMyData } from "@/domain/privacy";
import { AppError } from "@/domain/errors";
import { rateLimit } from "@/domain/rate-limit";

export const dynamic = "force-dynamic";

/** A signed-in customer downloads their own data. Read-only access links cannot export. */
export async function GET() {
  const c = await getCustomer();
  if (!c)
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
      { status: 401 },
    );
  try {
    await rateLimit(db, `export:${c.customer.id}`, 5, 3600);
    const data = await exportMyData(db, c.ctx);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="my-data.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError)
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    throw e;
  }
}
