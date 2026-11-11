# Orylo — final evidence report

Dates of work: 2026-11-10 and 2026-11-11 · Branch: `claude/beautiful-ptolemy-87we05` (the mandate named `feat/orylo-complete-platform-20261110`; the session harness
designated the former and forbids pushing elsewhere without permission; no history was rewritten) · Revision: see §15.

**Correction of an earlier statement.** The first version of this report said the CI workflow had "never run on GitHub". That was **wrong**: it had run
(run 42836311375 passed; run 42839772562 failed at `npm run format`, because of formatting in `next.config.ts` and an accidentally committed `.vitest/json/output.json`).
Both were my errors — the failed run was visible and I had not looked. Fixed, and every later run is listed in §15.

**Bottom line.** A working modular-monolith product with real persistence, auth, an Action Gateway with verified outcomes, three workflows, a durable job worker,
customer/operator/admin interfaces, data export/erasure, an eGain-facing HTTP action API, a container image, and automated tests including 72 real-browser tests
— all running against a **simulated** subscription provider with **synthetic** data. It is **not deployed to any host**, **not connected to eGain**, and **not used by any
customer**. The live eGain agent (Gate H) is **BLOCKED**: no eGain tenant access exists here, and obtaining it needs the owner's own account (see `egain/published-agent-acceptance-log.md` §0).
**Readiness verdict: a verified, honest prototype and eGain-ready backend; NOT production-ready and NOT hackathon-submittable as an eGain entry until the owner completes the eGain side.**

## 1. Starting state (verified)
Empty repository: no commits, no branches (not even `main`), no PRs, no issues (GitHub API + local checkout). `docs/evidence/00-repository-baseline.md`.

## 2. What was verified, and how
| Evidence | Result (final code) |
|---|---|
| Vitest, real PostgreSQL 16, 12 files | **125 passed / 0 failed** — state machine, domain flows, gateway safety, policy, isolation, workflows, job queue/worker (concurrency, lease recovery, retry, exhaustion, post-approval execution), privacy/erasure, evidence validation/encryption, config fail-fast, security regressions |
| Playwright, real Chromium, 8 files | **72 passed / 0 failed** against `next start` on a freshly reset + seeded database (§10) |
| Same journeys against the **container** stack | 52 of them (auth, journey, API contract, customer, operator) passed against `docker compose` on a second port (§ deployment contract) |
| `tsc --noEmit`, `eslint .`, `prettier --check` | clean (every commit is gated on real exit codes) |
| `next build` | passes, **also with no `.env` and no database** |
| `npm audit --audit-level=high` | exit 0: no high/critical; 12 moderate (dev tooling) |
| GitHub Actions | green — runs listed in §15 |
| Independent code review (separate agent, static) | 19 findings + 3 suspected; dispositions in `docs/security/independent-review.md` |

Tests that exercise real behaviour (not snapshots): concurrency (5 simultaneous confirms → 1 mutation; 30 jobs × 6 workers → each exactly once), timeout-after-apply safe replay,
stale state/consent/policy refusal, DB-trigger refusal of fabricated resolution, append-only enforcement, cross-tenant negative tests, read-only staff links, consent finality/expiry,
hash-chain/receipt tamper detection, autonomous retry and exhaustion → human escalation, erasure refused while a case is open.

**Defects the 2026-11-11 browser journeys found in my own product (all fixed, each with a regression test):** operators could not assign cases (empty assignee list); organization
settings could not be saved on a plan without custom branding; an approved >threshold action waited for the customer to click again (now a durable job runs it); invite sign-up
ended on "invitation not valid"; `next build` required a database; approvals' decision buttons were off-screen and caused page-level horizontal overflow on a phone.

## 3. Architecture
`docs/architecture/overview.md` (modular monolith: Next.js 16 + Drizzle + PostgreSQL + Better Auth; 50 tables; 14-state machine; ADRs).

## 4. Working product areas (all against synthetic data + simulator)
Marketing (home, product, 5 solutions, pricing, security, about, contact/lead, legal drafts, demo) · customer portal · operator console · admin
(org, members/invites, policies, workflows, integrations, API keys, ledger, audit, billing-test) · eGain action API (5 endpoints) · seed + demo reset.

## 5. Unfinished, blocked, or unverified
- **BLOCKED:** everything on eGain's platform (agent, knowledge upload, intents, pre-chat, workflow, actions, publication, link, video, validation in Test AI Agent). No eGain credentials, tenant or connector exists in this environment (checked 2026-11-11: environment, connector list, registry). Access needs the owner's own trial account and acceptance of eGain's terms; this environment will not create accounts or enter credentials for the owner.
- **Not built:** real provider connectors; email delivery (reset/invitation links are not sent — shown once to the admin / logged in development); SSO/MFA; object storage; malware scanning; localisation.
- **Not deployed:** no hosting account used. The container image and compose stack were built and run **locally**; nothing is reachable from the internet.
- **Not tested at all:** screen readers or any assistive technology (no claim is made), 320 px reflow / 400 % zoom, usability with real people, load, fuzzing, penetration testing.
- **Residual known issues:** `style-src 'unsafe-inline'`; tables on small screens scroll horizontally inside their card (approvals now has a card layout; other tables do not); uploaded evidence has structural validation only.

## 6. Design & UX review
I inspected rendered screenshots (home desktop, operator case detail, portal case at desktop/mobile). Defects found and fixed this way: horizontal
overflow at desktop and 375 px, one-word-per-line columns, wrapped badge "ovals", clipped table columns, form fields wiped after a validation
error (React 19 form reset), control-border contrast below 3:1, missing hint/error ↔ input association, missing 404/error pages. On 2026-11-11 I additionally captured 88 screenshots (22 screens × light/dark × 1280 px/390 px: marketing, sign-in, 404, portal, console, and 11 admin pages) and
inspected them as contact sheets. Found and fixed: horizontal page overflow on a phone caused by an absolutely-positioned `sr-only` label escaping a scroll container (all tables), and approval
controls hidden off-screen on a phone (now a card layout). Dark and light themes render coherently. **Not** inspected: every marketing sub-page, states other than the seeded ones. Screenshots: `docs/evidence/screenshots/` (journey captures).

## 7. Domain, API and database inventory
See `docs/product/api-and-workflow-contracts.md`, `docs/product/screen-inventory.md`, `src/db/schema.ts`, `drizzle/` (4 migrations: schema, append-only/verified-resolution triggers, jobs/privacy/auth-rate-limit tables, audited redaction path).
Unused scaffolding: `evaluation_runs`, `test_fixtures`, `integration_events` tables.

## 8. Security & privacy
`docs/security/threat-model.md` and `docs/security/independent-review.md`. Closed since the first draft: DB-backed auth rate limits and throttles on every sign-in/reset path, explicit proxy trust,
nonce CSP, explicit-POST access links, evidence encryption + validation, write quotas, streaming export, fail-fast production config, data export and audited erasure.
**Reported separately, NOT satisfied:** MFA/SSO (not built) and an external penetration test (not done — application tests are not a substitute). Other residuals: `style-src 'unsafe-inline'`, no upload malware scanning, no load/DoS testing. No compliance certification is claimed.

## 9. Accessibility (automated)
axe (WCAG 2.0/2.1/2.2 A+AA tags, serious/critical) clean on 12 public pages in light and dark, 5 portal and 15 console/admin pages (light). Control-border and subtle-text
contrast corrected by formula (`docs/product/design-tokens-and-components.md`). Keyboard (skip link, command palette), reduced-motion, target-size and overflow checks pass.
**Automated tools find only a subset of issues; no assistive-technology testing was done.**

## 10. Final browser run
**72 passed / 0 failed** (Chromium desktop, 3.6 min, `next start` production build, freshly reset + seeded database). Files: `journey.spec.ts` (customer→operator→customer verified resolution, boundaries, unsafe redirect, lead capture), `customer-journeys.spec.ts` (decline, human support, cancel/reopen, evidence upload/download/disguised-file refusal/cross-customer, export, erasure approved and refused), `operator-journeys.spec.ts` (approval grant/decline/role limits + mobile reachability, autonomous execution after approval, escalation ownership and hand-back, assign/priority/notes with customer visibility, analyst read-only, search),
`admin-journeys.spec.ts` (invite→accept→role→deactivate, owner protection, org settings validation/persistence, policy draft→submit→separate approver, bad rules refused, workflow draft→publish, simulator mode, API key create/revoke, plan/page access, ops pages), `recovery-and-access.spec.ts` (full password reset incl. old session revocation and single-use link, sign-in throttling, read-only access link, CSP on every page, 404s),
`a11y-responsive.spec.ts` (axe light+dark, keyboard, reduced motion, overflow, target size), `egain-api.spec.ts` (12 contract tests), `auth.spec.ts`. Every journey creates its own synthetic customer (`tests/e2e/fixtures.ts`) rather than depending on the shared seed.

## 11. eGain trial entitlement audit and live status
`egain/entitlement-audit.md`: every capability is `UNVERIFIED in trial` or `Not found in public docs` — nothing was assumed available. Live agent, published link,
Test-AI-Agent validation, published-link validation: **BLOCKED**. Orylo-side API: implemented and contract-tested locally (`tests/e2e/egain-api.spec.ts`), not publicly reachable.
Known differences between `openapi.yaml` and the implementation are tabulated in `egain/action-contracts/README.md`.

## 12. Hackathon readiness matrix (125 pts; official page read 2026-11-10: deadline Nov 15 11:59 PM PST; internal target Nov 12 23:30 Africa/Lagos)
| Requirement | Prepared in repo | Done in eGain | Status |
|---|---|---|---|
| Knowledge-based agent, authorized content | 12 policy docs (byte-identical to policy pack) | no | **BLOCKED** |
| Published shareable link | instructions | no | **BLOCKED** |
| Pre-chat workflow | spec | no | **BLOCKED** |
| ≥2 escalation options | spec + working Orylo endpoints (callback, email) | no | **BLOCKED** (Orylo side verified locally) |
| Process workflow bound to intent | guided-flow spec | no | **BLOCKED** |
| Real action | Orylo API verified locally | no (trial support for HTTP actions UNVERIFIED) | **BLOCKED** |
| Validation in Test AI Agent + published link | 20 test scripts | no | **BLOCKED** |
| 150-word description | drafted (139 words; fallback 102) | n/a | Draft — owner must verify each sentence |
| One-minute demo video | script + shot list | no | **Not recorded** (rule: only record what is true) |
**Disclosure corrected 2026-11-11:** the earlier sentence "built … before this hackathon" was inaccurate and is removed. Facts: first commit 2026-11-10 13:32 UTC, written during the competition period with AI coding assistance (permitted by the rules; disclosed). Official deadline: November 15, 11:59 PM PST. See `docs/hackathon/submission-description.md`. Video/description may only claim behaviour verified live on eGain — none exists yet.

## 13. Commercial startup readiness
| Area | State |
|---|---|
| Product | working prototype on synthetic data; no real integration |
| Customers / traction / revenue | **none** — no discovery interviews done; all market, persona and pricing statements are hypotheses (`docs/strategy/`) |
| Pricing | provisional experiments; test billing provider only; no live payments |
| Legal | privacy/terms are drafts needing counsel; name uncleared; no entity |
| Security/compliance | no certification; open items above |
| Operations | no deployment, monitoring, backups, on-call |

## 14. Infrastructure cost
Authoring/testing: **$0** (native PostgreSQL, local tooling; free web fetches). Proposed production costs were **not quoted** (would need current provider
pricing): one small app host, one managed PostgreSQL, a domain, an email provider, eGain licensing — all unpriced and unprovisioned. Nothing was purchased or provisioned.

## 15. GitHub
Branch: `https://github.com/VictorCyberDev/orylo/tree/claude/beautiful-ptolemy-87we05`. **No pull request exists:** the remote has no `main` (or any) base branch, and creating one is an owner decision.
CI runs (workflow `CI`, job `checks` = format, lint, typecheck, audit, DB tests, build, Playwright; job `container` = image builds, stack boots, health, headers):
| Run | Commit | Result |
|---|---|---|
| 42836311375 | `8b0719f` | success |
| 42839772562 | `86c0d20` | **failure** (format) — fixed |
| 43003504350 | `248aa56` | success |
| 43004783668 | `4cb3cd9` | success |
| 43006665252 | `89feff1` | success — https://github.com/VictorCyberDev/orylo/actions/runs/43006665252 |
FINAL_CI_PLACEHOLDER

## 16. Owner authorizations still required
1. Create/choose a base branch (e.g. `main`) so a PR can be opened; confirm branch naming.
2. eGain: create/use your own trial account and follow `egain/configuration-guide.md`, decide the Action tier (A/B/C), and submit — the official deadline is **November 15, 11:59 PM PST**.
3. Hosting: choose/provision a host + Postgres so eGain can reach the action API (any spend); set the secrets in `docs/operations/deployment-contract.md`.
4. Email provider, domain, trademark/name clearance, legal review of the drafts.
5. MFA/SSO decision and an independent penetration test before any real-data use.

## 17. Reproduction
```bash
git clone https://github.com/VictorCyberDev/orylo && cd orylo && git checkout claude/beautiful-ptolemy-87we05
npm ci && cp .env.example .env.local   # set random BETTER_AUTH_SECRET / RECEIPT_SIGNING_KEY / EVIDENCE_ENCRYPTION_KEY (base64, 32 bytes) / CRON_SECRET
createdb orylo && createdb orylo_test      # PostgreSQL 16 (or: docker compose up -d db)
npm run db:migrate && npm run db:seed
npm test                                   # Vitest, real DB (125 tests)
npm run build && npm run test:e2e          # Playwright (set PW_CHROMIUM_PATH if needed) (72 tests)
docker compose up --build                  # db + app image, http://localhost:3000 (demo placeholder secrets)
```

## 18. Acceptance matrix and final classification
| Mandate item | Class | Basis |
|---|---|---|
| Case state machine, Action Gateway, ledger, escalation (simulator) | **VERIFIED COMPLETE** (for the simulator) | DB-backed tests incl. concurrency, timeout replay, negative cases |
| Policy governance | **VERIFIED COMPLETE** (rules/prose in DB; no file ingestion) | tests + browser draft→approve with separation of duties |
| Workflow engine + 3 workflows | **VERIFIED COMPLETE** | persisted steps; timeouts/retries run by the worker; browser draft→publish |
| Autonomous worker (retry, timeout, expiry, retention) | **VERIFIED COMPLETE** | queue/concurrency/lease/exhaustion tests; running in container |
| Tenant isolation | **VERIFIED COMPLETE** (as tested) | negative tests on every surface, composite FKs |
| Customer portal journeys | **VERIFIED COMPLETE** (as tested) | decline, evidence, human support, cancel/reopen, export, erasure, access link, reset — in a real browser |
| Operator console journeys | **VERIFIED COMPLETE** (as tested) | approvals, ownership, assignment, notes, analyst limits |
| Admin area | **VERIFIED COMPLETE** (as tested) | members, settings, policy, workflow, integrations, keys, billing visibility, ops pages |
| Data export / erasure | **VERIFIED COMPLETE** | domain + browser; redaction path audited |
| Authentication & recovery | **PARTIALLY COMPLETE** | full reset, throttling, session revocation verified; **no email delivery, no MFA/SSO** |
| Security closure (P4) | **PARTIALLY COMPLETE** | listed items fixed and regression-tested; MFA/SSO absent; pen test not done; style-src inline |
| Marketing site | **PARTIALLY COMPLETE** | built, axe-clean, key pages visually inspected, not every sub-page |
| Analytics | **VERIFIED COMPLETE** (measured) / modelled savings labelled | tests |
| Billing foundation | **PARTIALLY COMPLETE** | test provider only; no payments possible |
| Notifications | **PARTIALLY COMPLETE** | in-app durable; email never sent |
| Accessibility | **PARTIALLY COMPLETE** | axe + keyboard + reflow checks; **no screen-reader or zoom testing** |
| eGain action API | **VERIFIED** locally (contract tests); **not publicly reachable** | `egain-api.spec.ts` |
| eGain live agent / published demo / video | **BLOCKED** | no tenant access; owner must create the account |
| CI pipeline | **VERIFIED COMPLETE** | green GitHub runs in §15, including the container job |
| Container deployment | **VERIFIED locally** — **not deployed** | image builds, stack boots/migrates, journeys pass; no hosted deployment |
| Production readiness | **NOT READY** | no host, email, MFA/SSO, pen test, scanning, monitoring; owner decisions in §16 |
| Documentation | **PARTIALLY COMPLETE** | extensive; some strategy docs are hypotheses by design |

## 19. Resumable execution manifest
Done: everything above. Next, in order: (1) owner creates/uses an eGain trial account → configure per `egain/configuration-guide.md` → fill `egain/published-agent-acceptance-log.md` only with what is observed;
(2) owner chooses a host and Postgres, sets the secrets per the deployment contract, rehearses backup/restore; (3) email provider so reset/invitation links are delivered; (4) MFA/SSO and an external penetration test;
(5) screen-reader and zoom testing by a person; (6) a contract test that loads `openapi.yaml` and compares it to the implementation (known differences are tabulated in `egain/action-contracts/README.md`); (7) real discovery interviews (`docs/product/discovery-interview-guide.md`).
