import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/auth/auth";

const handlers = toNextJsHandler(getAuth());
export const GET = handlers.GET;

/**
 * Public self-registration is NOT offered: accounts are created only by accepting an invitation (server-side) or by
 * seeding. Exposing /sign-up/email would let anyone create accounts and enumerate emails via "already exists".
 */
export async function POST(req: NextRequest) {
  if (new URL(req.url).pathname.endsWith("/sign-up/email"))
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Sign-up is by invitation only" } },
      { status: 403 },
    );
  return handlers.POST(req);
}
