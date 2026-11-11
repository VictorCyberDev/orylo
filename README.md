# Orylo — Verified Resolution Infrastructure

> **Working name.** "Orylo" is an uncleared codename (no trademark search, domain or entity). Rename in
> `src/config/brand.ts`. All data in this repository is **synthetic**.

Orylo is a governed customer exception-resolution platform. A chat conversation is not a resolution; a refund
request is not a refund; a cancellation request is not a stopped subscription. Orylo sits after the conversation:

**Detect → Decide → Execute → Verify.** It finds what really happened, applies *approved, versioned* policy and the
customer's *consent*, performs the change through a typed, idempotent **Action Gateway**, then **reads the result
back** before anything is called done. Only verified evidence can mark a case `VERIFIED_RESOLVED`.

Status of this build (honest): a working modular monolith with real persistence, auth, tests and a real-browser
journey — running against a **simulated** subscription provider. No real billing/scheduling system is integrated,
no customers exist, nothing has been deployed. See [`docs/evidence/final-report.md`](docs/evidence/final-report.md)
for what was verified, what is blocked, and what is unverified.

## What works (verified by automated tests — see the evidence report)
- Marketing site (home, product, 5 solutions, pricing, security, about, contact/lead capture, legal drafts, demo).
- Customer portal: sign-in or approved case-access link, start a case, see findings / consent wording / receipts,
  upload evidence, ask for a person (2 options), reopen, feedback, notifications, privacy.
- Operator console: command center, case search/filters, case detail with recommendation → evidence → actions,
  approvals, escalations (ownership, return-to-automation), analytics (measured vs modelled), notifications.
- Admin: organization settings, members & invitations, policies & knowledge (versions, review, quarantine, test
  question), workflow authoring (validated, versioned, separation of duties), integrations (simulator modes),
  API keys, outcome ledger (chain verification), audit log, plan & usage (TEST billing only).
- Three workflows: Failed Cancellation & Billing Recovery (state-changing demo action), Missed Appointment
  Recovery and Warranty Claim Readiness (internal steps only).
- HTTP action API for an eGain agent + commissioning package in [`egain/`](egain/) (**live eGain configuration is BLOCKED —
  no eGain tenant access in the build environment**).

## Quick start (no private credentials needed)
Requirements: Node 22+, PostgreSQL 16 (Docker or native).

```bash
npm ci
cp .env.example .env.local            # placeholders are fine for local dev
docker compose up -d db               # or point DATABASE_URL at any local Postgres 16
npm run db:migrate
npm run db:seed                       # synthetic orgs, users, policy pack, provider accounts, demo cases
npm run dev                           # http://localhost:3000  → /demo lists the accounts
```

> `npm run dev` accepts the placeholder secrets in `.env.example`. `npm start` (production mode) and the
> Playwright suite **refuse** placeholder/short secrets — put random values in `.env.local`
> (`openssl rand -base64 32` for `BETTER_AUTH_SECRET`, `RECEIPT_SIGNING_KEY`, `EVIDENCE_ENCRYPTION_KEY` and `CRON_SECRET`). `/demo` credentials show only when `DEMO_MODE=true`.

Demo password for every seeded user: `OryloDemo!2026` (shown on `/demo` only while `DEMO_MODE` is not `false`).
Reset to a clean synthetic world any time: `npm run demo:reset`.

> **Container path (verified locally, not on a host):** `docker compose up --build` starts PostgreSQL 16 and the app image
> (migrations run on start; `http://localhost:3000`; throwaway demo secrets). Load demo data with `docker compose run --rm app seed`.
> Behind a corporate/CI proxy that re-signs TLS, build with `--build-context ca=<dir containing ca-bundle.crt>`.
> See `docs/operations/deployment-contract.md` for the required environment, migration/rollback/backup, and what is **not** verified
> (no hosted deployment exists).

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run typecheck` · `lint` · `format` | static checks (CI runs all three) |
| `npm test` | unit + DB-backed integration + security tests (Vitest, real PostgreSQL via `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright: journeys, axe (WCAG 2.2 AA, light + dark), responsive, keyboard, API contract. Resets and reseeds `DATABASE_URL` first; needs `npm run build && npm start` or lets Playwright start it |
| `npm run db:generate` | generate a Drizzle migration after editing `src/db/schema.ts` |
| `npm run db:migrate` · `db:seed` · `db:reset` · `demo:reset` | database lifecycle (reset refuses non-local databases) |
| `npm run egain:export` | regenerate `egain/knowledge/*.md` from the policy pack (single source of truth) |

Set `PW_CHROMIUM_PATH` if Playwright's own browser is not installed.

## Layout
```
src/domain/      resolution core: case state machine, policy, Action Gateway, ledger, escalation, analytics, billing, admin
src/workflows/   workflow spec (zod), built-in definitions, engine
src/adapters/    subscription-provider contract + simulator (failure/delay/duplicate/stale/denied modes)
src/db/          Drizzle schema (47 tables) ; drizzle/ holds migrations incl. append-only + verified-resolution triggers
src/app/         Next.js routes: (marketing) · portal · app (console+admin) · api · server actions
src/components/  design system (ui.tsx, client.tsx) and case/operator components
src/policy/      the fictional policy pack (source for the DB seed AND egain/knowledge)
src/seed/        deterministic synthetic world + demo cases
tests/           unit · integration (real DB) · e2e (Playwright)
egain/           eGain commissioning package (knowledge, intents, flows, OpenAPI action contract, entitlement audit, test scripts)
docs/            strategy · product · architecture · security · operations · evidence · hackathon
```

## Documentation map
Architecture: [`docs/architecture/overview.md`](docs/architecture/overview.md) · Security: [`docs/security/threat-model.md`](docs/security/threat-model.md)
· Operations (deploy, rollback, reset, limits): [`docs/operations/runbook.md`](docs/operations/runbook.md) · Product & UX: [`docs/product/`](docs/product/)
· Strategy/research (all hypotheses): [`docs/strategy/`](docs/strategy/) · eGain: [`egain/README.md`](egain/README.md), [`docs/hackathon/`](docs/hackathon/)
· Evidence: [`docs/evidence/`](docs/evidence/).

## Known limitations
See [`docs/operations/runbook.md#known-limitations`](docs/operations/runbook.md#known-limitations). Highlights: simulated provider only; no email
provider (email is recorded as *skipped*, never *sent*); evidence files stored in the DB; no SSO/MFA; no independent
pen-test; not deployed; Docker Compose unverified; legal pages are drafts.
