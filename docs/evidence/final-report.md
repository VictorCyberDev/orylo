# Orylo — final evidence report

Date of work: 2026-11-10 · Branch: `claude/beautiful-ptolemy-87we05` (the mandate named `feat/orylo-complete-platform-20261110`; the session harness
designated the former and forbids pushing elsewhere without permission) · Revision: see `git log -1` on that branch.

**Bottom line.** A working modular-monolith product with real persistence, auth, an Action Gateway with verified outcomes, three
workflows, customer/operator/admin interfaces, an eGain-facing HTTP action API, and automated tests — all running against a
**simulated** subscription provider with **synthetic** data. It has **not** been deployed, **not** connected to eGain, and **not** used by any
customer. The live eGain agent (Gate H) is **BLOCKED**: this session had no eGain tenant access.

## 1. Starting state (verified)
Empty repository: no commits, no branches (not even `main`), no PRs, no issues (GitHub API + local checkout). `docs/evidence/00-repository-baseline.md`.

## 2. What was verified, and how
| Evidence | Result (final code) |
|---|---|
| Vitest, real PostgreSQL 16, 7 files | **88 passed / 0 failed** — 6 state-machine unit, 65 domain integration (flows, gateway safety, policy, isolation, workflows, uploads, escalation, analytics, search), 17 security regressions |
| Playwright, real Chromium, 4 files | **41 passed / 0 failed** on the final code (§10) |
| `tsc --noEmit`, `eslint .`, `prettier --check` | clean |
| `next build` | passes (all routes) |
| Fresh clone → `npm ci` → migrate → seed → typecheck → lint → test → build | passed (run before the security patch set: 71 tests; re-run of the full suite since is above) |
| `npm audit` | 0 high/critical; 12 moderate (dev tooling: esbuild via drizzle-kit, minimatch) |
| Independent code review (separate agent, static) | 19 findings + 3 suspected; dispositions in `docs/security/independent-review.md` (several fixed, some OPEN) |

Tests that exercise real behaviour (not snapshots): concurrency (5 simultaneous confirms → 1 mutation), timeout-after-apply safe replay, stale
state/consent/policy refusal, DB-trigger refusal of fabricated resolution, append-only enforcement, cross-tenant negative tests on every surface,
read-only staff links, consent finality/expiry, hash-chain/receipt tamper detection.

## 3. Architecture
`docs/architecture/overview.md` (modular monolith: Next.js 16 + Drizzle + PostgreSQL + Better Auth; 47 tables; 14-state machine; ADRs).

## 4. Working product areas (all against synthetic data + simulator)
Marketing (home, product, 5 solutions, pricing, security, about, contact/lead, legal drafts, demo) · customer portal · operator console · admin
(org, members/invites, policies, workflows, integrations, API keys, ledger, audit, billing-test) · eGain action API (5 endpoints) · seed + demo reset.

## 5. Unfinished, blocked, or unverified
- **BLOCKED:** everything on eGain's platform (agent, knowledge upload, intents, pre-chat, workflow, actions, publication, link, video, validation in Test AI Agent). No eGain credentials existed here.
- **Not built:** real provider connectors; email delivery; scheduler for workflow timeouts; retention purge job; SSO/MFA; object storage; customer data export/deletion; localisation.
- **Not deployed:** no hosting account used; CI workflow written but **never run on GitHub**; `docker-compose.yml` never executed (no Docker daemon).
- **Partially tested:** admin form functions (domain-tested, only API-key creation browser-tested); several customer journeys (decline, missing evidence, unavailable integration, human-support submit, reopen submit) are domain-tested but not browser-tested; password-reset *completion* not tested (no email).
- **Not tested at all:** screen readers, 320 px reflow / 400 % zoom, usability with real people, load, fuzzing, penetration.

## 6. Design & UX review
I inspected rendered screenshots (home desktop, operator case detail, portal case at desktop/mobile). Defects found and fixed this way: horizontal
overflow at desktop and 375 px, one-word-per-line columns, wrapped badge "ovals", clipped table columns, form fields wiped after a validation
error (React 19 form reset), control-border contrast below 3:1, missing hint/error ↔ input association, missing 404/error pages. **Not** visually reviewed
page by page: most marketing sub-pages, all admin pages, dark theme of signed-in pages (axe only). Screenshots: `docs/evidence/screenshots/`.

## 7. Domain, API and database inventory
See `docs/product/api-and-workflow-contracts.md`, `docs/product/screen-inventory.md`, `src/db/schema.ts`, `drizzle/` (2 migrations: schema + append-only/verified-resolution triggers).
Unused scaffolding: `evaluation_runs`, `test_fixtures`, `integration_events` tables.

## 8. Security & privacy
`docs/security/threat-model.md` and `docs/security/independent-review.md`. **Open items** (stated, not hidden): in-memory auth rate limiter; limiter trusts proxy header;
CSP allows inline scripts; grant-link GET sets cookie; no MFA/SSO; evidence stored in DB without scanning; no pen test. No compliance certification claimed.

## 9. Accessibility (automated)
axe (WCAG 2.0/2.1/2.2 A+AA tags, serious/critical) clean on 12 public pages in light and dark, 5 portal and 15 console/admin pages (light). Control-border and subtle-text
contrast corrected by formula (`docs/product/design-tokens-and-components.md`). Keyboard (skip link, command palette), reduced-motion, target-size and overflow checks pass.
**Automated tools find only a subset of issues; no assistive-technology testing was done.**

## 10. Final browser run
**41 passed / 0 failed** (Chromium desktop, 1.9 min, against `next start` on a freshly reset + seeded database). Files: `journey.spec.ts` (customer→operator→customer verified-resolution journey, cross-customer and staff/customer boundaries, unsafe redirect, lead capture), `a11y-responsive.spec.ts` (axe light+dark, keyboard, reduced motion, overflow at 375/820/1280/1440/1920 px, target size), `egain-api.spec.ts` (12 API contract tests), `auth.spec.ts` (7 session/reset/invite/sign-up-closure tests). Earlier intermediate runs had failures that were real and are fixed (form fields wiped on validation error, layout overflow, contract status mismatch, a streaming 200-on-404 caused by a root loading boundary).

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
Owner decision flagged by the author of the package: the disclosure sentence "Orylo … built … before this hackathon" must be checked against the facts (the repo started 2026-11-10).

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
Branch pushed: `https://github.com/VictorCyberDev/orylo/tree/claude/beautiful-ptolemy-87we05`. **No pull request exists:** the remote has no `main` (or any) base branch, and
creating one is an owner decision.

## 16. Owner authorizations still required
1. Create/choose a base branch (e.g. `main`) so a draft PR can be opened; confirm branch naming.
2. eGain: provide tenant access (or do the configuration in `egain/configuration-guide.md`) — decide the Action tier (A/B/C) by 2026-11-11; submission itself.
3. Hosting: choose/provision a host + Postgres so eGain can reach the action API (any spend).
4. Email provider, domain, trademark/name clearance, legal review of the drafts.
5. Decide on remaining OPEN security items before any real-data use.

## 17. Reproduction
```bash
git clone https://github.com/VictorCyberDev/orylo && cd orylo && git checkout claude/beautiful-ptolemy-87we05
npm ci && cp .env.example .env.local        # set random BETTER_AUTH_SECRET / RECEIPT_SIGNING_KEY for `npm start` and e2e
docker compose up -d db                      # or any PostgreSQL 16 + create the *_test database
npm run db:migrate && npm run db:seed
npm test                                     # Vitest, real DB
npm run build && npm run test:e2e            # Playwright (set PW_CHROMIUM_PATH if needed)
```

## 18. Final milestone classification
| Component | Class | Basis |
|---|---|---|
| Case state machine, Action Gateway, ledger, escalation (simulator) | **VERIFIED COMPLETE** (for the simulator) | 88 DB-backed tests incl. concurrency/negative |
| Policy governance (versions, approval, quarantine, conflicts) | **VERIFIED COMPLETE** (rules/prose in DB; no file ingestion) | tests |
| Workflow engine + 3 workflows | **PARTIALLY COMPLETE** | works; timeouts need a caller; some spec fields unused |
| Tenant isolation | **VERIFIED COMPLETE** (as tested) | negative tests, DB FKs |
| Customer portal | **PARTIALLY COMPLETE** | core journeys browser-verified; others domain-tested |
| Operator console | **PARTIALLY COMPLETE** | core path browser-verified; approvals/ownership UI not browser-tested |
| Admin area | **PARTIALLY COMPLETE** | domain-tested; UI mostly untested in browser |
| Marketing site | **PARTIALLY COMPLETE** | built, axe-clean; not fully visually reviewed |
| Authentication | **PARTIALLY COMPLETE** | sign-in/out/session/invite tested; no email verification/reset delivery |
| Analytics | **VERIFIED COMPLETE** (measured) / modelled savings labelled | tests |
| Billing foundation | **PARTIALLY COMPLETE** | test provider only |
| Notifications | **PARTIALLY COMPLETE** | in-app durable; email never sent |
| eGain action API | **VERIFIED** locally; **not deployed** | contract tests |
| eGain live agent / published demo / video | **BLOCKED** | no tenant access |
| CI pipeline | **UNVERIFIED** | written, never executed on GitHub |
| Deployment | **UNVERIFIED / not done** | — |
| Documentation | **PARTIALLY COMPLETE** | extensive; some docs describe unbuilt items as roadmap |
| Security | **PARTIALLY COMPLETE** | reviewed + fixed; open items listed |

## 19. Resumable execution manifest
Done: everything above. Next, in order: (1) owner unblocks eGain access or hosting; (2) run CI on GitHub and fix any environment-specific failures; (3) browser-test remaining
journeys (decline, evidence, human support, reopen, approvals, ownership) and admin forms; (4) address OPEN items in `docs/security/independent-review.md`; (5) add a scheduler/caller for `sweepTimeouts`
and retention purge; (6) resolve the OpenAPI/implementation differences with a contract test that loads the YAML; (7) real discovery interviews (`docs/product/discovery-interview-guide.md`).
