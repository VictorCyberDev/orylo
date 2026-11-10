import { z } from "zod";
import type { DbOrTx } from "@/db";
import { leads } from "@/db/schema";
import { AppError } from "./errors";
import { rateLimit } from "./rate-limit";
import { sha256Hex } from "./crypto";

export const LeadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address").max(200),
  company: z.string().trim().max(160).optional().default(""),
  useCase: z
    .enum(["subscription_billing", "telecom_service", "digital_commerce", "warranty_claims", "general", ""])
    .optional()
    .default(""),
  message: z.string().trim().max(2000).optional().default(""),
  /** Honeypot: real people never see or fill this field. */
  website: z.string().max(0).optional().default(""),
});

export async function submitLead(db: DbOrTx, raw: unknown, meta: { ip: string }) {
  const parsed = LeadSchema.safeParse(raw);
  if (!parsed.success) {
    // A filled honeypot is reported as success so bots learn nothing.
    if (
      typeof (raw as { website?: unknown })?.website === "string" &&
      (raw as { website: string }).website.length > 0
    )
      return { ok: true as const, id: null };
    throw new AppError("VALIDATION", parsed.error.issues.map((i) => i.message).join("; "), {
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
    });
  }
  const ipHash = sha256Hex(`lead-ip:${meta.ip}`).slice(0, 24);
  await rateLimit(db, `lead:${ipHash}`, 5, 600);
  const d = parsed.data;
  const [row] = await db
    .insert(leads)
    .values({
      name: d.name,
      email: d.email,
      company: d.company || null,
      useCase: d.useCase || null,
      message: d.message || null,
      ipHash,
    })
    .returning({ id: leads.id });
  return { ok: true as const, id: row.id };
}
