# Operations runbook

Status: written from the code. **Nothing has been deployed**; no hosting account was provisioned or used (that needs
owner authorization — see the final report). Steps below are the intended procedure and have **not** been executed
against a hosted environment.

## Configuration (environment)
| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL 16 |
| `BETTER_AUTH_SECRET` | production | ≥ 32 random chars (`openssl rand -base64 32`); the app refuses to start without it in production |
| `RECEIPT_SIGNING_KEY` | production | HMAC key for action receipts; rotating it invalidates verification of older receipts (keep old keys for verification if you rotate) |
| `APP_URL`, `BETTER_AUTH_URL` | yes | canonical origin (auth callbacks, sitemap, metadata) |
| `DEMO_MODE` | — | set `false` outside demos: hides seeded credentials on `/demo` |
| `ACTION_TIMEOUT_MS` | — | provider-call timeout (default 5000) |
| `TEST_DATABASE_URL` | tests | database name must end in `_test` |

Never commit real values. `.env.local` is git-ignored; `.env.example` holds placeholders only.

## Deploy

See `deployment-contract.md` for the verified container path, required environment, migration/rollback/backup and what remains unverified. The generic notes below predate it.

## Deploy (generic, unverified)
1. Provision PostgreSQL 16 and set the variables above in the host's secret store.
2. `npm ci && npm run build`.
3. `DATABASE_URL=… npm run db:migrate` (migrations are forward-only SQL in `drizzle/`; run **before** starting the new version).
4. `npm start` (or the platform's Next.js runtime). Health: `GET /api/health` → `{"status":"ok","db":"up"}`.
5. Do **not** run `db:seed` against production: it refuses when `NODE_ENV=production` unless `ALLOW_PRODUCTION_SEED=yes`, and the data is synthetic.
6. Issue an API key (Admin → API keys; requires a plan with API access) for any eGain agent; store it only in eGain's secret store.

## Rollback
- **Application:** redeploy the previous build. Migrations are additive in this repo's history; a build only needs the schema it was built with plus any later *additive* migrations.
- **Database:** there are no down-migrations. Take a snapshot/backup before `db:migrate`; to roll back a schema change, restore the snapshot. The append-only triggers intentionally block `UPDATE/DELETE` on evidence tables, so data fixes to those tables require a deliberate, audited superuser procedure (disable trigger → fix → enable) — do not do this casually.
- **Policy / workflow:** versioned. Re-approve/publish the previous version (policy: supersession is automatic on approval; workflow: publish the earlier version again as a new draft → publish).

## Demo reset
`npm run demo:reset` drops the schema, re-applies migrations and reseeds the synthetic world (refuses non-local DBs). Each successful
eGain/portal action changes the synthetic accounts, so reset before recording a demo or before judges test.

## Health & observability
Only `/api/health` and `console` logging exist. Structured audit rows are in `audit_events` (Admin → Audit log). There is no metrics
pipeline, tracing, or alerting (listed as a gap).

## Incident basics
- Provider failing → Admin → Integrations shows the simulator mode; actions record attempts and escalate after the policy limit (2).
- Suspect tampering → Admin → Outcome ledger recomputes the hash chain on load.
- Leaked API key → Admin → API keys → Revoke (effective immediately; keys are stored hashed).

## Costs
Local development and all tests ran at **$0** infrastructure (native PostgreSQL, free tooling). A minimal hosted setup would be
one small Node host + one managed Postgres; actual prices were **not** quoted or provisioned — obtain current prices from your
chosen provider before committing. Domains, email sending and eGain licensing are separate, unquoted costs.

## Known limitations
1. Provider is a **simulator**; no real billing/scheduling connector exists.
2. Email is never sent (no provider); rows are recorded as `SKIPPED`. Password-reset and invitation links are shown in-app / logged in dev only.
3. Evidence files are stored in PostgreSQL (≤ 2 MB each), no malware scanning, no object storage.
4. No SSO/SAML/MFA/IP allow-listing; no independent penetration test; no SOC 2/ISO.
5. Workflow timeouts only fire when `sweepTimeouts` runs (Admin/ops trigger); there is no scheduler.
6. Rate limiter is a simple fixed window; client IPs come from `x-forwarded-for` (only trustworthy behind a proxy you control).
7. Docker Compose file unverified (no Docker daemon in the authoring environment).
8. Legal pages are drafts needing counsel; brand name uncleared.
9. Analytics are computed live with SQL aggregates (fine for demo scale; unbenchmarked beyond that).
10. Screen-reader and usability testing with real users have not been done.
11. `evaluation_runs`, `test_fixtures`, `integration_events` tables are unused scaffolding.
12. Dev-tooling dependency advisories (moderate; esbuild via drizzle-kit, minimatch) are present; no high/critical.
