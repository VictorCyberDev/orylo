# Threat model and security controls

Status: authored by the implementer and then **independently reviewed by a separate review agent** (see "Independent
review" below). Neither is a substitute for a human penetration test, which has **not** been done. No compliance
certification (SOC 2, ISO 27001, HIPAA, PCI) is claimed.

## Assets and trust boundaries
| Asset | Why it matters |
|---|---|
| Tenant data (cases, customers, evidence, policy) | confidentiality between organizations |
| Action Gateway | the only path that changes anything for a customer |
| Outcome ledger / audit / case events | integrity of "what really happened" |
| API keys, customer tokens, session cookies | bearer credentials |
| Policy rules | authorization input (must not be editable by content or by their author alone) |

Boundaries: Internet → Next.js (server actions, route handlers) → domain layer (`Ctx{orgId, actor}`) → PostgreSQL;
Orylo → provider adapter (simulated); eGain agent → Orylo (bearer key + customer token).

## Threats, controls, and the test that exercises each
| Threat | Control (where) | Evidence (test) |
|---|---|---|
| Cross-tenant read/write, IDOR | `orgId` predicate on every domain query; composite FKs `(id, organization_id)`; customers resolve to their own `customerId` and get 404 (not 403) for others' cases | `policy-and-isolation.test.ts` › Scenario F (cases, actions, views, lists, audit, export, analytics, escalations, DB FK refusal); `journey.spec.ts` › cannot open another customer's case |
| Privilege escalation | `ROLE_PERMISSIONS` checked in domain functions (not UI); only owner grants owner; last owner protected; customers have no staff path | `workflows-and-modules.test.ts` › admin; `gateway-safety.test.ts` › Scenario C |
| Separation of duties | policy author ≠ approver; workflow author ≠ publisher; requester ≠ approver | `policy-and-isolation.test.ts`, `workflows-and-modules.test.ts` |
| Duplicate / replayed consequential actions | `unique(org, idempotency_key)`; row locks; provider-side idempotency key; replay with altered payload rejected | `gateway-safety.test.ts` › Scenario D (5 concurrent confirms → 1 mutation, 1 receipt) |
| Missing/stale consent, stale policy, stale state | consent required; `expected_state_hash`; policy version must still be current at execution | `gateway-safety.test.ts` (stale consent, stale state), `policy-and-isolation.test.ts` (supersession → `POLICY_STALE`) |
| Incorrect success claims | read-after-write verification; DB trigger forbids `VERIFIED_RESOLVED` without verified ledger evidence + verified required objectives | `recovery-flow.test.ts` (direct SQL refused; ghost provider op → UNVERIFIED → escalated) |
| Evidence tampering | triggers block UPDATE/DELETE; ledger hash chain recomputed; receipts HMAC-signed | `policy-and-isolation.test.ts` › append-only; `recovery-flow.test.ts` (forged receipt detected) |
| Prompt injection via knowledge | policy text is data; instruction-like sections quarantined & unapprovable; authorization reads `rules` only | `policy-and-isolation.test.ts` › Malicious knowledge injection |
| Contradictory policy | conflicting rules withheld → action refused, customer routed to a person | `policy-and-isolation.test.ts` |
| Brute force / enumeration | identical response for unknown account vs wrong email; per-key+email rate limit; Better Auth limits on sign-in/up/reset | `workflows-and-modules.test.ts` (eGain session), `egain-api.spec.ts` (429 + Retry-After) |
| Credential handling | API keys `oryk_…` shown once, stored SHA-256; customer tokens 32-byte random, hashed, 30-min TTL; invitations hashed + expiring + email-bound; audit metadata redacts secret-like keys | `workflows-and-modules.test.ts`, `egain-api.spec.ts` |
| Unsafe upload | size ≤ 2 MB; allow-list of 4 types; extension + magic-byte match; sanitized names; served as attachment with `nosniff` and sandbox CSP | `workflows-and-modules.test.ts` › uploads |
| Open redirect | `next` accepted only for `/app`, `/portal`, `/invite` paths | `journey.spec.ts` › unsafe `next` ignored |
| XSS | React escaping everywhere; no `dangerouslySetInnerHTML` except fixed JSON-LD and theme bootstrap; per-request nonce CSP with `strict-dynamic` — no `'unsafe-inline'` for scripts (styles still allow it) | `recovery-and-access.spec.ts` (header, zero violations, injected handler blocked) tested (gap) |
| CSRF | server actions: Next origin checks; bearer REST: not cookie-authenticated | not separately tested (gap) |
| Injection | Drizzle parameterization; the few raw `sql` fragments interpolate only bound parameters; search input escaped for `LIKE` | not fuzzed (gap) |
| Information disclosure | uniform error envelope; customer views are projections (no executor ids, authorization refs, internal notes, policy ids) | `policy-and-isolation.test.ts` › customer boundaries; `egain-api.spec.ts` |

## Known gaps (honest)
- No independent penetration test; no fuzzing; no dependency review beyond `npm audit` (moderate dev-tooling advisories only).
- CSP allows inline scripts (framework requirement without a nonce pipeline).
- No MFA/SSO; sessions are 7-day cookies.
- Evidence files in the DB without malware scanning.
- Rate limiter trusts `x-forwarded-for`.
- Demo credentials page (`/demo`) must be disabled (`DEMO_MODE=false`) outside demos.
- Superuser database access can disable the evidence triggers.

## Updates 2026-11-11

Mitigations added since the first draft: database-backed authentication rate limits (all instances share them), explicit trust boundary for client IPs (`TRUSTED_PROXY_HOPS`), read-only access links that require an explicit POST before a session exists, encrypted + structurally validated evidence, per-customer write quotas, fail-fast production configuration, durable job worker with retry/expiry/retention (no manual recovery commands), data export and audited erasure. **Still unmitigated or unproven:** MFA/SSO (absent), external penetration test (not done), malware scanning of uploads (absent), `style-src 'unsafe-inline'`, denial-of-service/load behaviour (untested), the Better Auth library itself (not reviewed).
