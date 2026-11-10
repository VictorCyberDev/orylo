import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256Hex = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function signingKey(): string {
  const k = process.env.RECEIPT_SIGNING_KEY;
  if (k) return k;
  if (process.env.NODE_ENV === "production") throw new Error("RECEIPT_SIGNING_KEY must be set in production");
  return "dev-only-receipt-signing-key";
}

export const hmacHex = (data: string, key = signingKey()) =>
  createHmac("sha256", key).update(data).digest("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** URL-safe random token. Only the SHA-256 hash is ever stored. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Deterministic JSON (sorted keys) so hashes/signatures are reproducible. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}
