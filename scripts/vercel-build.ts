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
  run(["scripts/seed.ts"]); // prints "Database already has data" and exits 0 when already seeded
}
