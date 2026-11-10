import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { resolveGrant } from "@/domain/channel";
import { GRANT_COOKIE } from "@/auth/session";
import { findCase } from "@/domain/cases";

/** Approved case-access link: validates the grant, sets an httpOnly cookie scoped to /portal, and lands on the case. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const g = await resolveGrant(db, token);
    let dest = "/portal";
    if (g.caseId) {
      const c = await findCase(db, { orgId: g.organizationId, actor: { type: "customer", id: `grant:${g.id}`, customerId: g.customerId } }, g.caseId);
      dest = `/portal/cases/${c.reference}`;
    }
    const res = NextResponse.redirect(new URL(dest, req.url));
    res.cookies.set(GRANT_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: Math.max(60, Math.floor((g.expiresAt.getTime() - Date.now()) / 1000)) });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/sign-in?expired=1", req.url));
  }
}
