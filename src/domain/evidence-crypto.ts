/**
 * Evidence at rest: AES-256-GCM, random 96-bit IV per file, authenticated (tampering → decryption fails).
 * Key: EVIDENCE_ENCRYPTION_KEY (base64, 32 bytes). REQUIRED in production (src/lib/config.ts). In development a key is
 * derived from BETTER_AUTH_SECRET so the app works out of the box; that derivation is NOT acceptable for production.
 * Stored layout: "OEV1" | iv(12) | tag(16) | ciphertext.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("OEV1");

export function evidenceKey(env: Record<string, string | undefined> = process.env): Buffer {
  const k = env.EVIDENCE_ENCRYPTION_KEY;
  if (k) {
    const b = Buffer.from(k, "base64");
    if (b.length !== 32)
      throw new Error(
        "EVIDENCE_ENCRYPTION_KEY must be base64 for exactly 32 bytes (openssl rand -base64 32)",
      );
    return b;
  }
  if (env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build")
    throw new Error("EVIDENCE_ENCRYPTION_KEY is required in production");
  return Buffer.from(
    hkdfSync("sha256", env.BETTER_AUTH_SECRET ?? "dev-only-secret", "orylo-evidence", "evidence-v1", 32),
  );
}

export function encryptEvidence(plain: Buffer, key = evidenceKey()): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

export function decryptEvidence(stored: Buffer, key = evidenceKey()): Buffer {
  if (stored.length < 4 + 12 + 16 || !stored.subarray(0, 4).equals(MAGIC))
    throw new Error("Stored evidence is not in the expected encrypted format");
  const d = createDecipheriv("aes-256-gcm", key, stored.subarray(4, 16));
  d.setAuthTag(stored.subarray(16, 32));
  return Buffer.concat([d.update(stored.subarray(32)), d.final()]);
}
