import { NextResponse } from "next/server";
import { db } from "@/db";
import { getStaff } from "@/auth/session";
import { exportOrganizationData } from "@/domain/admin";
import { AppError } from "@/domain/errors";

export async function GET() {
  const s = await getStaff();
  if (!s)
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
      { status: 401 },
    );
  try {
    const data = await exportOrganizationData(db, s.ctx);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${s.org.slug}-export.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError)
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    throw e;
  }
}
