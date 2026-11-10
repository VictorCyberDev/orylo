import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __oryloPool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 20) });
}

export const pool: Pool = globalForDb.__oryloPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__oryloPool = pool;

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export type Db = typeof db;
/** A transaction handle OR the root db: domain functions accept either so they compose inside one tx. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
export { schema };
