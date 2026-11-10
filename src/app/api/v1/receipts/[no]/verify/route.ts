import type { NextRequest } from "next/server";
import { db } from "@/db";
import { verifyReceipt } from "@/domain/actions";
import { handle, json } from "@/lib/api";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/domain/rate-limit";
import { sha256Hex } from "@/domain/crypto";

/** Public: anyone holding a receipt number can confirm it is genuine. Returns nothing about the customer or case. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ no: string }> }) {
  return handle(req, async () => {
    const { no } = await params;
    const ip = clientIp(req.headers);
    await rateLimit(db, `receipt:${sha256Hex(ip).slice(0, 16)}`, 60, 60);
    if (!/^RCPT-\d{8}-[A-F0-9]{16}$/.test(no)) return json({ valid: false }, 404);
    const r = await verifyReceipt(db, no);
    return r.valid
      ? json({
          valid: true,
          receipt: {
            receiptNo: r.receipt.receiptNo,
            operation: r.receipt.operation,
            issuedAt: r.receipt.issuedAt,
          },
        })
      : json({ valid: false }, 404);
  });
}
