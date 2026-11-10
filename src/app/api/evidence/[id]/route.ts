import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { getStaff, getCustomer } from "@/auth/session";
import { getEvidenceFile } from "@/domain/uploads";
import { AppError } from "@/domain/errors";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = (await getStaff())?.ctx ?? (await getCustomer())?.ctx;
  if (!ctx) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } }, { status: 401 });
  try {
    const e = await getEvidenceFile(db, ctx, id);
    return new NextResponse(new Uint8Array(e.content), {
      headers: { "Content-Type": e.contentType, "Content-Disposition": `attachment; filename="${e.filename.replace(/"/g, "")}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox; default-src 'none'" },
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    throw err;
  }
}
