// Loads .env.local / .env for CLI scripts (Next.js does this itself for the app). Existing env vars win.
import { existsSync } from "node:fs";
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
