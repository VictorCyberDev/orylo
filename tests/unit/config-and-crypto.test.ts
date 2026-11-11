import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { validateProductionConfig } from "@/lib/config";
import { decryptEvidence, encryptEvidence, evidenceKey } from "@/domain/evidence-crypto";
import { clientIp } from "@/lib/ip";
import { validateJpeg, validatePdf, validatePng, validateText } from "@/domain/evidence-validate";
import { JPEG, PDF, PDF_WITH_JS, PNG } from "../fixtures";

const good = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
  RECEIPT_SIGNING_KEY: randomBytes(32).toString("base64"),
  EVIDENCE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  DATABASE_URL: "postgres://u:p@db/orylo",
  APP_URL: "https://app.example.org",
};

describe("production configuration is validated before the server starts", () => {
  it("accepts a strong configuration", () => expect(validateProductionConfig(good)).toEqual([]));
  it("rejects missing / short / placeholder secrets, identical keys, bad evidence key, http URL, demo mode", () => {
    const p = validateProductionConfig({
      BETTER_AUTH_SECRET: "change-me-dev-only-secret-at-least-32-chars-long",
      RECEIPT_SIGNING_KEY: "short",
      EVIDENCE_ENCRYPTION_KEY: "AAAA",
      APP_URL: "http://app.example.org",
      DEMO_MODE: "true",
      CRON_SECRET: "x",
      TRUSTED_PROXY_HOPS: "one",
    });
    const joined = p.join("\n");
    for (const needle of [
      "BETTER_AUTH_SECRET looks like a placeholder",
      "RECEIPT_SIGNING_KEY must be at least",
      "EVIDENCE_ENCRYPTION_KEY must be base64",
      "DATABASE_URL is not set",
      "APP_URL must be an https",
      "DEMO_MODE=true",
      "CRON_SECRET must be at least",
      "TRUSTED_PROXY_HOPS",
    ])
      expect(joined).toContain(needle);
    expect(
      validateProductionConfig({ ...good, RECEIPT_SIGNING_KEY: good.BETTER_AUTH_SECRET }).join(),
    ).toContain("must differ");
    expect(validateProductionConfig({ ...good, EVIDENCE_ENCRYPTION_KEY: undefined }).join()).toContain(
      "EVIDENCE_ENCRYPTION_KEY is not set",
    );
  });
  it("allows http only for localhost, and an explicit opt-in for a public demo", () => {
    expect(validateProductionConfig({ ...good, APP_URL: "http://localhost:3000" })).toEqual([]);
    expect(validateProductionConfig({ ...good, DEMO_MODE: "true", ALLOW_DEMO_IN_PRODUCTION: "yes" })).toEqual(
      [],
    );
  });
});

describe("evidence encryption at rest (AES-256-GCM)", () => {
  const key = randomBytes(32);
  it("round-trips, never stores plaintext, uses a fresh IV, and detects tampering and wrong keys", () => {
    const plain = Buffer.from("receipt: card ending 4242 — synthetic");
    const a = encryptEvidence(plain, key);
    const b = encryptEvidence(plain, key);
    expect(a.includes(plain)).toBe(false);
    expect(a.equals(b)).toBe(false);
    expect(decryptEvidence(a, key).equals(plain)).toBe(true);
    const t = Buffer.from(a);
    t[t.length - 1] ^= 1;
    expect(() => decryptEvidence(t, key)).toThrow();
    expect(() => decryptEvidence(a, randomBytes(32))).toThrow();
    expect(() => decryptEvidence(plain, key)).toThrow(/expected encrypted format/);
  });
  it("requires a real key in production and a 32-byte key always", () => {
    expect(() => evidenceKey({ NODE_ENV: "production" })).toThrow(/required in production/);
    expect(() => evidenceKey({ EVIDENCE_ENCRYPTION_KEY: "AAAA" })).toThrow(/32 bytes/);
    expect(evidenceKey({ NODE_ENV: "development", BETTER_AUTH_SECRET: "x" })).toHaveLength(32);
  });
});

describe("proxy trust boundary", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("ignores forwarded headers unless trusted hops are configured", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" }), 0)).toBe("direct");
  });
  it("with n trusted hops takes the n-th entry from the right; spoofed left entries are ignored", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }), 1)).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" }), 2)).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6" }), 2)).toBe("unknown"); // fewer hops than configured → not trusted
    expect(clientIp(h({}), 1)).toBe("unknown");
  });
});

describe("structural upload validation", () => {
  it("accepts valid files", () => {
    expect(() => validatePng(PNG)).not.toThrow();
    expect(() => validateJpeg(JPEG)).not.toThrow();
    expect(() => validatePdf(PDF)).not.toThrow();
    expect(() => validateText(Buffer.from("plain ✓"))).not.toThrow();
  });
  it("rejects truncated, trailing-data (polyglot-style), scripted and non-UTF-8 files", () => {
    expect(() => validatePng(PNG.subarray(0, PNG.length - 12))).toThrow(/incomplete|corrupted/);
    expect(() => validatePng(Buffer.concat([PNG, Buffer.from("<script>alert(1)</script>")]))).toThrow(
      /unexpected data/,
    );
    expect(() => validateJpeg(Buffer.concat([JPEG, Buffer.from("MZ")]))).toThrow(/incomplete/);
    expect(() => validatePdf(PDF_WITH_JS)).toThrow(/scripts|embedded/);
    expect(() => validatePdf(Buffer.from("%PDF-1.4 no eof"))).toThrow(/incomplete/);
    expect(() => validateText(Buffer.from([0xff, 0xfe, 0x41]))).toThrow(/UTF-8/);
  });
});
