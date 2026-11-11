import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __oryloPool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 20) });
}

/**
 * The pool and Drizzle client are created on FIRST USE, not on import. `next build` imports every route module to
 * collect page data; it must not need a database (or DATABASE_URL) just to compile. Behaviour at runtime is unchanged:
 * the first query throws the same clear error if DATABASE_URL is missing.
 */
function lazy<T extends object>(make: () => T): T {
  let inst: T | undefined;
  const get = () => (inst ??= make());
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = get();
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
    has: (_t, prop) => Reflect.has(get(), prop),
  });
}

function getPool(): Pool {
  if (!globalForDb.__oryloPool) globalForDb.__oryloPool = createPool();
  return globalForDb.__oryloPool;
}
export const pool: Pool = lazy(getPool);

export const db: NodePgDatabase<typeof schema> = lazy(() => drizzle(getPool(), { schema }));
export type Db = typeof db;
/** A transaction handle OR the root db: domain functions accept either so they compose inside one tx. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
export { schema };
