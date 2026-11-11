# Independent security review — findings and disposition

Status: a separate review agent (no part in writing the code) read the code **statically** (it could not run it) and
reported 19 numbered findings plus 3 suspected issues. They were verified/fixed by the implementer; every FIXED row
has a regression test in `tests/security/review-findings.test.ts` unless noted. This is not a penetration test.

| # | Sev | Finding | Disposition | Evidence |
|---|---|---|---|---|
| 1 | High | Staff could forge customer consent by issuing themselves a portal link | **FIXED** — operator-issued links are READ-ONLY (`readOnly` actor; `assertCanAct` in every customer mutation; link scope `case:read`) | F1 |
| 2 | Med | Case-scoped links enforced on one page only | **FIXED** — `caseScope` enforced in `assertCaseAccess` and `listCases` (and evidence download) | F2 |
| 3 | Med | Admin could deactivate an owner | **FIXED** | F3 |
| 4 | Med | `advance` had no caller access check; analysts could trigger it; client-supplied `caseRef` | **FIXED** — `advance` asserts access, `advanceAction` needs `case.write`, case derived from the request row | F4 (domain level; the server-action wrappers are not unit-tested) |
| 5 | Med | `record_review_decision` not bound to the case's account | **FIXED** | F5 |
| 6 | Med | DB errors logged bound parameters (PII, upload bytes) | **FIXED** — `logError` strips `params:` | F6 |
| 7 | Med | Demo credentials shown by default | **FIXED** — off unless `DEMO_MODE=true`; read at request time | not unit-tested; page loads covered by axe |
| 8 | Med | Placeholder/short production secrets accepted; receipt key failed after mutation | **FIXED** — enforced at runtime (not build), checked before any provider call | F8; observed live: `next start` refused the dev secret |
| 9 | Med | Rate limiter keyed on spoofable XFF; table grew unbounded | **FIXED (2026-11-11)** — client IP is taken only through an explicit trust boundary (`TRUSTED_PROXY_HOPS`, default 0 = ignore forwarding headers); old rows are purged by the maintenance job. Correct only if the operator sets the real hop count (documented in `docs/operations/deployment-contract.md`) | `tests/unit/config-and-crypto.test.ts`, `tests/security/privacy-and-evidence.test.ts` |
| 10 | Med | Open sign-up + enumeration; in-memory auth rate limit | **FIXED (2026-11-11)** — sign-up closed (403, e2e); auth limiter storage is the database (`auth_rate_limits`, shared by all instances); the server-action sign-in and password-reset paths (which bypass Better Auth's HTTP limiter) have explicit per-IP+email and per-account throttles | `auth.spec.ts`, `recovery-and-access.spec.ts` (sign-in throttling in a real browser) |
| 11 | Low–Med | No quotas on authenticated writes; unbounded export | **FIXED (2026-11-11)** — database-backed quotas on case creation, evidence, escalation, erasure, access-link opening and other customer writes; evidence validated structurally (magic bytes, size, type) and encrypted at rest (AES-256-GCM); organization export is a bounded NDJSON stream. **No malware-scanning engine** exists (stated residual) | F11, `privacy-and-evidence.test.ts`, `customer-journeys.spec.ts` (disguised file refused) |
| 12 | Low | Policy rules unvalidated; bad values fail open | **FIXED** — typed rule schema; malformed stored values dropped (fail closed) | F12 |
| 13 | Low | "No" after "yes" could execute; no consent expiry | **FIXED** — answers final, 72 h TTL. Exhausted-attempt re-execution is blocked by the state machine | F13 |
| 14 | Low | Internal rule keys / adapter text visible to customers | **FIXED** — fixed wording; detail kept in internal payload | F14 |
| 15 | Low | GET grant link sets cookie (login CSRF), token in URL, cookie path | **FIXED (2026-11-11)** for the GET-with-side-effect problem — opening `/access/<token>` renders an interstitial; only an explicit POST sets the session, so a mail scanner or prefetch cannot start one; sign-out clears the cookie. The token still appears in the URL (read-only, 24 h) — **ACCEPTED residual** | `recovery-and-access.spec.ts` (no cookie after a plain GET; read-only view after confirming) |
| 16 | Low | CSP `unsafe-inline`, no HSTS/COOP | **FIXED for scripts (2026-11-11)** — per-request nonce CSP with `strict-dynamic` and no `'unsafe-inline'`/`'unsafe-eval'` for scripts, `frame-ancestors 'none'`; HSTS (production) and COOP. **Residual:** `style-src` still allows `'unsafe-inline'` (React/Radix inline styles) | `recovery-and-access.spec.ts` (CSP header on every page, zero console violations, injected inline handler blocked) |
| 17 | Low | API-key details | **PARTIAL** — dead `cases:read` scope removed. Rate limit after auth, email-keyed lockout, `Idempotency-Key` semantics (audit-only; replay safety comes from the action id) documented, otherwise **OPEN/ACCEPTED** | — |
| 18 | Low | 32-bit receipt ids | **FIXED** — 64 bits | F18 |
| 19 | Low | Invitation role not validated; invalid dates → 500 | **FIXED** | F3 / cases page |
| S1 | — | Timed-out internal op keeps writing in the open tx | **FIXED** — internal ops are not raced against the timeout | by construction (no dedicated test) |
| S2 | — | Idempotency-key race could alias another request | **FIXED** | suspected-section test |
| S3 | — | `DEMO_MODE` baked at build | **FIXED** — `force-dynamic` | — |

Categories the reviewer found clean: SQL injection, stored/reflected XSS, SSRF, open redirects, tenant isolation (no cross-tenant path found),
hard-coded real secrets.

## Added 2026-11-11 (same review, second pass by the implementer — not independent)

| Item | Status |
|---|---|
| Customer data export / erasure with tamper-safe redaction path | Built and browser-tested; the redaction path is the **only** sanctioned rewrite of append-only tables and is audited |
| Operators could not assign cases (assignee list required member-management rights) | **FIXED** — found by a browser journey; regression test `assignable-members.test.ts`; the list exposes names only |
| Org settings could not be saved on plans without custom branding | **FIXED** — entitlement checked only when branding actually changes; `org-settings.test.ts` |
| Invite sign-up redirect race (account created, page showed "invitation not valid") | **FIXED** — server-side redirect; browser journey |
| Production configuration | Fail-fast: placeholder/short secrets, wrong-length evidence key and unflagged demo mode refuse to start |

## Not done — reported separately, not substituted by code

- **MFA / SSO: not built.** Passwords only (scrypt via Better Auth).
- **Penetration test: not done.** Application tests and a static review are not a penetration test and must not be described as one.
- Fuzzing, load/DoS testing, review of the Better Auth library itself, a malware-scanning engine for uploads, secrets scanning of the repository history.
