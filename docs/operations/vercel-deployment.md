# Public demo deployment (Vercel Hobby + Postgres) — status, steps, rollback

**Status (2026-11-11): NOT DEPLOYED. BLOCKED on one resource: a free PostgreSQL database that is isolated from the owner's other projects.**
Nothing was created on Vercel, Neon or Supabase, and no money was spent. The application, build, serverless worker and
configuration are ready and were verified locally; the missing piece is somewhere to put the data.

## What was checked (read-only), and why it blocks

| Account (connected to this session) | Finding | Consequence |
|---|---|---|
| Vercel — team "StartUP", plan **Hobby** | Free; GitHub integration is linked to `VictorCyberDev`, so the public repo can be deployed. 20 existing projects (payflow, providia, …) — **not touched**. | The hosting side is available at no extra cost. |
| Neon — org "Victor", plan **free** | **10 of 10 free projects already exist.** | Creating another project would need a paid plan. Not done. |
| Supabase — org "VictorCyberDev's Org", plan **free** | 2 projects already **active** (kochab-revenue-engine, Providia) + 3 paused. Free plan allows 2 active. | A third active project is not free. Not created. |
| Using one of the existing databases | They belong to other products (Providia, PayFlow, Kora…). | Forbidden by the mandate; also a poor idea (shared credentials, shared data). |

## The smallest owner action that unblocks it (pick ONE)

1. **Free a Neon slot you no longer need** (the console shows several idle projects, e.g. with 0 active time), then say "go" — a new project `orylo-demo` is all that is required; or
2. **Add Neon through the Vercel Marketplace** on a new Vercel project named `orylo-demo` (Vercel → Storage → Neon). It injects `DATABASE_URL` automatically; or
3. **Pause one of the two active Supabase projects** you do not need, then a `orylo-demo` Supabase project fits the free plan.

Do **not** put this app on a database that holds anything else.

## Steps once a database exists (≈10 minutes)

1. Generate fresh secrets locally (printed to your terminal only): `npm run deploy:secrets`.
2. Create the Vercel project from `VictorCyberDev/orylo` (branch `claude/beautiful-ptolemy-87we05`, or `main` once it exists). `vercel.json` already sets the build command and a daily cron.
3. Set the environment variables below (Production). Use the database's **pooled** connection string for `DATABASE_URL`.
4. Deploy. The build runs `npm run vercel-build`: applies migrations, loads the synthetic world **only if the database is empty**, then `next build`.
5. Smoke test (below). Then, in the eGain agent, allow the site's domain if eGain asks for allowed domains.
6. Optional: set the repository variable `TICK_URL` and secret `CRON_SECRET` so GitHub Actions calls the tick endpoint every 5 minutes (`.github/workflows/worker-tick.yml`).

## Environment variables (names only — values are secrets, never committed)

| Variable | Value / rule |
|---|---|
| `DATABASE_URL` | Pooled Postgres URL with `sslmode=require` |
| `DB_POOL_MAX` | `3` (serverless: many small instances) |
| `APP_URL`, `BETTER_AUTH_URL` | The public `https://…` origin, no trailing slash |
| `BETTER_AUTH_SECRET`, `RECEIPT_SIGNING_KEY` | ≥ 32 random chars, different from each other |
| `EVIDENCE_ENCRYPTION_KEY` | base64 of exactly 32 bytes (back it up separately) |
| `CRON_SECRET` | ≥ 24 random chars; Vercel Cron sends it as a Bearer token automatically |
| `JOB_WORKER` | `request` (serverless worker — see below) |
| `TRUSTED_PROXY_HOPS` | `1` (Vercel's edge sets the forwarded client IP) |
| `DEMO_MODE` | `false` (credentials are **never** printed on the public site) |
| `DEMO_PASSWORD` | Random ≥ 16 chars; the seed refuses the repository's public default on an https deployment |
| `REVIEWER_ACCESS_CODE` | Random ≥ 8 chars; give it privately to organizers — it reveals the sign-in details on `/demo` |
| `EGAIN_AGENT_ID`, `EGAIN_SERVER_URL` | Optional; default to the owner's published agent |
| `EGAIN_KNOWLEDGE_VERIFIED`, `EGAIN_ACTIONS_LIVE` | Leave unset until the matching live test passes (`/demo` shows the truth) |

## Worker on serverless — what is and is not true

Vercel functions freeze between requests, so the in-process timer worker cannot run there. With `JOB_WORKER=request`:
* due jobs are drained **after the response is sent** by ordinary requests (`after()`), at most once per 5 s per instance;
* `/api/internal/jobs/tick` (GET or POST, Bearer `CRON_SECRET`) drains them on demand; Vercel Cron calls it **daily** (Hobby plan limit);
* the optional GitHub Actions workflow calls it every 5 minutes;
* the queue is durable Postgres with `SKIP LOCKED` leases, so nothing is lost and any mix of callers is safe.
**Limit:** with no traffic and no scheduler, a due job waits until the next request or tick. Retry back-offs are "at least 15 s, usually the next request", not exact. Verified locally: with `JOB_WORKER=request` there is no in-process worker, and a due job inserted into the queue was completed by a `/api/health` request (`tests/integration/serverless-worker.test.ts` covers the throttle and containment).

## Smoke test after deploy (from a fresh browser, no cookies)

`GET /` and `/demo` → 200 · `GET /api/health` → `{"status":"ok","db":"up"}` · `/demo` shows the eGain bubble and **no** password · reviewer code reveals accounts · sign in as the synthetic customer → case page → confirm cancellation → "Verified" · receipt check on `/demo` accepts the receipt · `POST /api/internal/jobs/tick` without secret → 401 · response CSP contains a nonce and no `unsafe-inline` for scripts · browser console has no errors other than the two known, harmless eGain entries (blocked dev telemetry; optional `custom.js` hook).
Then run `LIVE_PUBLIC_URL=https://<site> npm run test:live` to test the real eGain agent on the real site.

## Rollback

* App: Vercel → Deployments → promote the previous deployment (instant). Migrations 0000–0003 are additive; the older build runs on the newer schema.
* Data: reseed with `npm run demo:reset` against the demo database (never against anything else), or restore from the database provider's point-in-time history.
* Kill switch for the widget only: set `EGAIN_WIDGET=off` and redeploy; the rest of the site is unaffected.
* Full stop: pause or delete the Vercel project; the repository and database are untouched.
