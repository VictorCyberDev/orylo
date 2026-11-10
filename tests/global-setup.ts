import { execSync } from "node:child_process";

/** Applies migrations to the TEST database once per run. Requires a reachable Postgres (see .env.example). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://orylo:orylo@localhost:5432/orylo_test";
  if (!/_test\b/.test(url)) throw new Error("TEST_DATABASE_URL must point at a database whose name ends in _test");
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
