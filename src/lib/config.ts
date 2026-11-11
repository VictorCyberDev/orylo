/**
 * Fail-fast production configuration check, run when the server boots (src/instrumentation.ts). It refuses to start a
 * production server with placeholder/short secrets, a missing evidence key, a plain-http public URL, or demo credentials
 * switched on — instead of discovering the problem at the first sensitive request.
 */
const PLACEHOLDER = /change-me|dev-only|example|placeholder|password|secret-secret/i;

export function validateProductionConfig(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  const strong = (name: string, v?: string, min = 32) => {
    if (!v) problems.push(`${name} is not set`);
    else if (v.length < min) problems.push(`${name} must be at least ${min} characters`);
    else if (PLACEHOLDER.test(v)) problems.push(`${name} looks like a placeholder`);
  };
  strong("BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET);
  strong("RECEIPT_SIGNING_KEY", env.RECEIPT_SIGNING_KEY);
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET === env.RECEIPT_SIGNING_KEY)
    problems.push("BETTER_AUTH_SECRET and RECEIPT_SIGNING_KEY must differ");
  if (!env.EVIDENCE_ENCRYPTION_KEY) problems.push("EVIDENCE_ENCRYPTION_KEY is not set");
  else if (Buffer.from(env.EVIDENCE_ENCRYPTION_KEY, "base64").length !== 32)
    problems.push("EVIDENCE_ENCRYPTION_KEY must be base64 for exactly 32 bytes");
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set");
  const url = env.APP_URL ?? "";
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url))
    problems.push("APP_URL must be an https:// URL (http is accepted only for localhost)");
  if (env.DEMO_MODE === "true" && env.ALLOW_DEMO_IN_PRODUCTION !== "yes")
    problems.push(
      "DEMO_MODE=true publishes the shared demo password; set DEMO_MODE=false (or ALLOW_DEMO_IN_PRODUCTION=yes for a deliberate public demo)",
    );
  if (env.CRON_SECRET && env.CRON_SECRET.length < 24)
    problems.push("CRON_SECRET must be at least 24 characters when set");
  const hops = env.TRUSTED_PROXY_HOPS;
  if (hops !== undefined && !/^\d+$/.test(hops))
    problems.push("TRUSTED_PROXY_HOPS must be a non-negative integer");
  return problems;
}

export function assertProductionConfig(env: Record<string, string | undefined> = process.env) {
  const problems = validateProductionConfig(env);
  if (problems.length) throw new Error(`Refusing to start in production:\n - ${problems.join("\n - ")}`);
}
