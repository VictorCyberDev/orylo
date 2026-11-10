import { and, desc, eq } from "drizzle-orm";
import { caseEvidence, resolutionCases } from "@/db/schema";
import type { DbOrTx } from "@/db";
import { AppError, notFound } from "./errors";
import type { Ctx } from "./context";
import { appendEvent, assertCaseAccess, lockCase } from "./cases";
import { sha256Hex } from "./crypto";
import { audit } from "./audit";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, { ext: string[]; magic?: (b: Buffer) => boolean }> = {
  "image/png": { ext: [".png"], magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: [".jpg", ".jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "application/pdf": { ext: [".pdf"], magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "text/plain": { ext: [".txt"], magic: (b) => !b.includes(0) },
};

export function sanitizeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "").slice(0, 100);
  return cleaned || "file";
}

/** Validate by declared type, extension AND file signature — a renamed executable is not an image. */
export function validateUpload(filename: string, declaredType: string, bytes: Buffer) {
  if (bytes.length === 0) throw new AppError("VALIDATION", "That file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "That file is larger than 2 MB.");
  const rule = ALLOWED[declaredType];
  if (!rule) throw new AppError("VALIDATION", "Please upload a PNG, JPEG, PDF or plain-text file.");
  const safe = sanitizeFilename(filename);
  if (!rule.ext.some((e) => safe.toLowerCase().endsWith(e))) throw new AppError("VALIDATION", "The file name does not match its type.");
  if (rule.magic && !rule.magic(bytes)) throw new AppError("VALIDATION", "The file contents do not match its type.");
  return { filename: safe, contentType: declaredType };
}

export async function addEvidence(db: DbOrTx, ctx: Ctx, caseRef: string, file: { filename: string; contentType: string; bytes: Buffer }, note?: string) {
  const v = validateUpload(file.filename, file.contentType, file.bytes);
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, ctx, caseRef);
    assertCaseAccess(ctx, c, ctx.actor.type === "operator");
    const [row] = await tx
      .insert(caseEvidence)
      .values({ organizationId: ctx.orgId, caseId: c.id, uploadedByType: ctx.actor.type, uploadedById: ctx.actor.id, filename: v.filename, contentType: v.contentType, sizeBytes: file.bytes.length, sha256: sha256Hex(file.bytes), note: note?.slice(0, 500), content: file.bytes })
      .returning({ id: caseEvidence.id, filename: caseEvidence.filename, sizeBytes: caseEvidence.sizeBytes, sha256: caseEvidence.sha256 });
    await appendEvent(tx, ctx, c.id, { type: "evidence.added", message: `Evidence added: ${v.filename}`, payload: { evidenceId: row.id, sha256: row.sha256 } });
    await audit(tx, ctx, { action: "evidence.add", targetType: "case", targetId: c.id, metadata: { filename: v.filename, bytes: file.bytes.length } });
    return row;
  });
}

export async function listEvidence(db: DbOrTx, ctx: Ctx, caseId: string) {
  return db
    .select({ id: caseEvidence.id, filename: caseEvidence.filename, contentType: caseEvidence.contentType, sizeBytes: caseEvidence.sizeBytes, sha256: caseEvidence.sha256, uploadedByType: caseEvidence.uploadedByType, createdAt: caseEvidence.createdAt })
    .from(caseEvidence)
    .where(and(eq(caseEvidence.caseId, caseId), eq(caseEvidence.organizationId, ctx.orgId)))
    .orderBy(desc(caseEvidence.createdAt));
}

export async function getEvidenceFile(db: DbOrTx, ctx: Ctx, evidenceId: string) {
  const [e] = await db.select().from(caseEvidence).where(and(eq(caseEvidence.id, evidenceId), eq(caseEvidence.organizationId, ctx.orgId)));
  if (!e) throw notFound("Evidence");
  const [c] = await db.select({ organizationId: resolutionCases.organizationId, customerId: resolutionCases.customerId }).from(resolutionCases).where(and(eq(resolutionCases.id, e.caseId), eq(resolutionCases.organizationId, ctx.orgId)));
  if (!c) throw notFound("Evidence");
  assertCaseAccess(ctx, c);
  return e;
}
