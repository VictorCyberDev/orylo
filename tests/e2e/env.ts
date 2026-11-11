// Loads .env.local/.env for test-side database access. Must be the FIRST import of any e2e module that touches "@/db".
import { existsSync } from "node:fs";
if (!process.env.DATABASE_URL)
  for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
