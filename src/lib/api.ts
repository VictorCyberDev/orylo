import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/domain/errors";
import { logError } from "@/lib/log";
import { ZodError } from "zod";
import { db } from "@/db";
import { authenticateApiKey } from "@/domain/admin";
import { channelCtx, resolveGrant } from "@/domain/channel";
import { rateLimit } from "@/domain/rate-limit";
import { sha256Hex } from "@/domain/crypto";
import { findCase } from "@/domain/cases";
import type { Ctx } from "@/domain/context";

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

/** Uniform error envelope: {error:{code,message}}; never leaks stack traces or internals. */
export async function handle(req: NextRequest, fn: (requestId: string) => Promise<NextResponse>) {
  const requestId = req.headers.get("x-request-id")?.slice(0, 64) ?? crypto.randomUUID();
  try {
    const res = await fn(requestId);
    res.headers.set("x-request-id", requestId);
    return res;
  } catch (e) {
    if (e instanceof AppError) {
      const extra: Record<string, string> = { "x-request-id": requestId };
      if (e.code === "RATE_LIMITED") extra["Retry-After"] = String(e.details?.retryAfterSec ?? 60);
      return json({ error: { code: e.code, message: e.message } }, e.status, extra);
    }
    if (e instanceof ZodError)
      return json(
        {
          error: {
            code: "VALIDATION",
            message: e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
          },
        },
        400,
        { "x-request-id": requestId },
      );
    logError("[api error]", e, { requestId });
    return json({ error: { code: "INTERNAL", message: "Unexpected error" } }, 500, {
      "x-request-id": requestId,
    });
  }
}

export async function readJson(req: NextRequest) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 64 * 1024) throw new AppError("VALIDATION", "Request body too large");
  try {
    return await req.json();
  } catch {
    throw new AppError("VALIDATION", "Body must be valid JSON");
  }
}

export async function apiKeyAuth(req: NextRequest, scope: string) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const a = await authenticateApiKey(db, bearer, scope);
  await rateLimit(db, `api:${a.keyId}`, 120, 60); // per key, per minute
  return a;
}

/** API key (org) + customer token (verified person). Both are required to touch a case. */
export async function channelAuth(
  req: NextRequest,
  caseRef: string,
): Promise<{ ctx: Ctx; caseId: string; keyId: string }> {
  const { orgId, keyId } = await apiKeyAuth(req, "egain:actions");
  const g = await resolveGrant(db, req.headers.get("x-customer-token"), orgId);
  const ctx = channelCtx(g);
  const c = await findCase(db, ctx, caseRef); // NOT_FOUND if the token's customer doesn't own it
  if (g.caseId && g.caseId !== c.id) throw new AppError("NOT_FOUND", "Case not found");
  return { ctx, caseId: c.id, keyId };
}
export { sha256Hex };
