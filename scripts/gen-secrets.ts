/**
 * Prints fresh random values for a PUBLIC deployment's environment variables (to your terminal only — nothing is written to disk
 * or committed). Paste them into your host's environment settings. Never reuse values between environments.
 *   npm run deploy:secrets
 */
import { randomBytes } from "node:crypto";
const b64 = (n: number) => randomBytes(n).toString("base64");
const hex = (n: number) => randomBytes(n).toString("hex");
const lines: [string, string][] = [
  ["BETTER_AUTH_SECRET", b64(48)],
  ["RECEIPT_SIGNING_KEY", b64(48)],
  ["EVIDENCE_ENCRYPTION_KEY", b64(32)], // exactly 32 bytes
  ["CRON_SECRET", hex(24)],
  ["DEMO_PASSWORD", `${hex(6)}-${hex(6)}-${hex(6)}`],
  ["REVIEWER_ACCESS_CODE", `${hex(3)}-${hex(3)}-${hex(3)}`],
];
for (const [k, v] of lines) console.log(`${k}=${v}`);
console.error(
  "\n(Generated locally; not stored anywhere. Back up EVIDENCE_ENCRYPTION_KEY separately — losing it makes uploaded evidence unrecoverable.)",
);
