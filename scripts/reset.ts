import "./env";
import { pool } from "../src/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../src/db";

/** Drops and recreates the public schema, then re-applies migrations. DEV/TEST ONLY. */
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production" || !/localhost|127\.0\.0\.1|_test|@db[:/]/.test(url)) {
    throw new Error(
      "Refusing to reset a database that does not look local/test: " + url.replace(/:[^:@]*@/, ":***@"),
    );
  }
  await pool.query(
    "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
  );
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("database reset + migrated");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
