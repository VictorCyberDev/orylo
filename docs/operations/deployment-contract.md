# Deployment contract

**Status:** what a host must provide so Orylo runs safely, and what has and has not been verified. Nothing here has been
deployed to a hosted environment: **no hosted deployment exists, no production database was touched, no money was spent.**
Verified locally means "on the build machine", not "on a customer-reachable host".

## Verified (2026-11-11, on the build machine)

| Claim | How it was checked |
|---|---|
| The image builds from a clean checkout with **no secrets and no database** | `docker build` succeeded; `next build` with `.env.local` removed and `DATABASE_URL` unset also succeeds (the pool is created on first query, not on import) |
| The stack starts and migrates itself | `docker compose up`: Postgres 16 healthy → app logs `migrations applied` → `Ready` → `/api/health` returns `{"status":"ok","db":"up"}`; container `HEALTHCHECK` reports healthy |
| The in-process job worker runs in the container | `job worker started` and a successful `maintenance.tick` in the container log |
| A restart loses nothing and re-applies nothing | `docker compose restart app`; health returns ok, migrations are idempotent |
| Browser journeys pass against the container | 52 of the customer/operator/auth/API journeys run against the container stack on a second port; the one failure was a hard-coded `:3000` in a test assertion, fixed and re-run green |
| The cron tick endpoint refuses unauthenticated callers | 401 without `CRON_SECRET`, 200 with it |
| Security headers are sent from the container | HSTS, nonce-based CSP observed with `curl -I` |

**Not verified:** any public hosting platform, TLS termination, a real reverse proxy (`TRUSTED_PROXY_HOPS` > 0), managed
Postgres, backups of a real database, multi-instance scaling, email delivery, or any eGain connectivity.

## Runtime requirements

- Node.js 22 (the image uses `node:22-bookworm-slim`), PostgreSQL 16, outbound HTTPS only if an email provider or eGain is configured.
- One process serves the web app **and** runs the job worker. To scale workers separately run `orylo-entrypoint worker`
  and set `JOB_WORKER=off` on web instances; jobs are claimed with `FOR UPDATE SKIP LOCKED`, so any number of workers is safe.
- Port `3000`. Health: `GET /api/health` (200 + `db: up`; 503 if the database is unreachable).

## Environment (all required in production unless marked optional)

| Variable | Purpose | Rule enforced at start-up |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | required |
| `BETTER_AUTH_SECRET` | session/signing secret | ≥ 32 chars, not a placeholder |
| `BETTER_AUTH_URL`, `APP_URL` | public origin (https) | required |
| `RECEIPT_SIGNING_KEY` | HMAC for action receipts | ≥ 32 chars, not a placeholder |
| `EVIDENCE_ENCRYPTION_KEY` | AES-256-GCM key for uploaded evidence, base64 of **exactly 32 bytes** | required; wrong length refused |
| `CRON_SECRET` | protects `POST /api/internal/jobs/tick` | required if the tick endpoint is used |
| `TRUSTED_PROXY_HOPS` | number of trusted reverse proxies in front of the app (0 = none). Wrong values let clients forge their IP and dodge rate limits | set to the real hop count |
| `DEMO_MODE` | synthetic demo behaviour | refused in production unless `ALLOW_DEMO_IN_PRODUCTION=yes` (an explicit, visible opt-in) |
| `JOB_WORKER`, `JOB_POLL_MS`, `ACTION_TIMEOUT_MS`, `DB_POOL_MAX` | optional tuning | defaults documented in `.env.example` |

`assertProductionConfig()` (`src/lib/config.ts`) refuses to start a production process with placeholder, short or missing
secrets. Generate keys with `openssl rand -base64 32`. Secrets are injected by the host; none is in the image or the repository.
The `docker-compose.yml` values are throwaway placeholders for a local run only.

## Migrations, rollback, recovery

- Forward-only SQL migrations in `drizzle/`, applied by `orylo-entrypoint web|migrate` (idempotent). Take a database backup **before** every deploy that adds a migration.
- Application rollback = redeploy the previous image. Migrations 0000–0003 are additive, so the previous image runs against the newer schema; a destructive migration must be written as expand → migrate → contract across two releases.
- Backup: `pg_dump --format=custom "$DATABASE_URL" > orylo-$(date +%F).dump`. Restore into an empty database: `pg_restore --clean --if-exists -d "$DATABASE_URL" orylo-….dump`. **A restore has not been rehearsed on a hosted database**; do so once before relying on it.
- Evidence files are encrypted in the database; losing `EVIDENCE_ENCRYPTION_KEY` makes them unrecoverable — back the key up separately from the database.
- The append-only audit, event and ledger tables are protected by database triggers; the only sanctioned rewrite is the audited erasure redaction path.

## Observability

Structured JSON logs on stdout (`level`, `msg`, job `kind/id/attempt/ms`); errors never include query parameters. `/api/health`
reports job backlog (`pending`, `running`, `dead`, `oldestDueSeconds`) — alert when `dead > 0` or `oldestDueSeconds` stays high.
The **Admin → Jobs** page lists failures and can requeue a dead job. No external monitoring, tracing or paging is wired up.

## Before exposing it to real users (owner decisions, not done here)

HTTPS termination and the correct `TRUSTED_PROXY_HOPS`; an email provider (without one, reset and invitation links are not
delivered); MFA/SSO (not built); an independent penetration test (not done); a malware-scanning engine for uploads (not present — only
structural validation); billing provider (test mode only, no payment is possible); a data-protection review of retention defaults.
