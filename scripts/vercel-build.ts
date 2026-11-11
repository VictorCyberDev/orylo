/**
 * Build step for serverless hosting (Vercel): apply migrations, load the synthetic demo world ONCE (only when the database is
 * empty — never wipes), then the caller runs `next build`. Safe to re-run on every deploy. Needs DATABASE_URL and, because the
 * site is public, DEMO_PASSWORD (scripts/seed.ts refuses the repository's public default). Set SKIP_DB_SETUP=1 to skip.
 */
import { execFileSync } from "node:child_process";
if (process.env.SKIP_DB_SETUP === "1" || !process.env.DATABASE_URL) {
  console.log("vercel-build: skipping database setup (SKIP_DB_SETUP=1 or no DATABASE_URL)");
} else {
  const run = (args: string[]) =>
    execFileSync("npx", ["tsx", ...args], { stdio: "inherit", env: process.env });
  run(["scripts/migrate.ts"]);
  // Seeding is refused under NODE_ENV=production unless explicitly allowed. It is allowed HERE only because this step (1) never wipes —
  // it exits 0 without touching anything when the database already has data — and (2) scripts/seed.ts refuses the public default
  // password on an https deployment, so DEMO_PASSWORD must be a real secret.
  execFileSync("npx", ["tsx", "scripts/seed.ts"], {
    stdio: "inherit",
    env: { ...process.env, ALLOW_PRODUCTION_SEED: "yes" },
  });
}
