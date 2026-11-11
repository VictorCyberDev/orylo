import "./env";
/** Seeds the synthetic demo world with real passwords (shared demo password; see src/seed/world.ts). */
import { db, pool } from "../src/db";
import { resetAllTables, seedWorld, DEMO_PASSWORD, DEFAULT_DEMO_PASSWORD } from "../src/seed/world";
import { count } from "drizzle-orm";
import { organizations } from "../src/db/schema";
import { seedDemoCases } from "../src/seed/demo-cases";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "yes")
    throw new Error("Refusing to seed in production");
  // The default password is public (it is in the repository). Never seed it into anything reachable from the internet.
  const publicHost = /^https:\/\//.test(process.env.APP_URL ?? "");
  if (publicHost && (DEMO_PASSWORD === DEFAULT_DEMO_PASSWORD || DEMO_PASSWORD.length < 16))
    throw new Error(
      "APP_URL is public: set DEMO_PASSWORD to a random value of at least 16 characters before seeding",
    );
  const [{ n }] = await db.select({ n: count() }).from(organizations);
  if (n > 0 && process.argv[2] !== "--force") {
    console.log(
      "Database already has data. Use `npm run demo:reset` for a clean slate, or pass --force to wipe and reseed.",
    );
    await pool.end();
    return;
  }
  if (n > 0) await resetAllTables(db);
  const w = await seedWorld(db, { withPasswords: true });
  await seedDemoCases(db, w);
  console.log(
    `Seeded ${Object.keys(w.users).length} staff, ${Object.keys(w.customers).length} customers, 2 organizations (${url.replace(/:[^:@]*@/, ":***@")}).`,
  );
  console.log(
    publicHost
      ? "Demo password set from DEMO_PASSWORD (not printed)."
      : `Demo password for every user: ${DEMO_PASSWORD}`,
  );
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
