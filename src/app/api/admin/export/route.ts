import { NextResponse } from "next/server";
import { db } from "@/db";
import { getStaff } from "@/auth/session";
import { exportOrganizationStream } from "@/domain/admin";
import { AppError } from "@/domain/errors";
import { rateLimit } from "@/domain/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getStaff();
  if (!s)
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
      { status: 401 },
    );
  try {
    await rateLimit(db, `org-export:${s.user.id}`, 5, 3600);
    const stream = await exportOrganizationStream(db, s.ctx);
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="${s.org.slug}-export.ndjson"`,
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
