import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { escalateCase } from "@/domain/escalation";
import { channelAuth, handle, json, readJson } from "@/lib/api";

const Body = z.object({ channel: z.enum(["callback_request", "email_request"]), reason: z.string().trim().min(1).max(500) }).strict();
export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  return handle(req, async () => {
    const { ref } = await params;
    const { ctx, caseId } = await channelAuth(req, ref);
    const b = Body.parse(await readJson(req));
    const r = await escalateCase(db, ctx, caseId, { reason: b.reason, reasonCode: "CUSTOMER_REQUEST", channel: b.channel });
    return json({ escalationId: r.escalation.id, status: r.escalation.status, channel: r.escalation.channel, message: r.created ? "A person now has your case, with everything we know." : "You already have an open request on this case." });
  });
}
