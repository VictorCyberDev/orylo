import { execSync } from "node:child_process";
/** Gives every e2e run a clean, deterministic synthetic world. */
export default function setup() {
  execSync("npx tsx scripts/reset.ts && npx tsx scripts/seed.ts", { stdio: "inherit" });
}
