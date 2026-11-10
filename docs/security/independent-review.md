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
| 9 | Med | Rate limiter keyed on spoofable XFF; table grew unbounded | **PARTIAL** — right-most/`x-real-ip` used, opportunistic purge. Still only trustworthy behind a proxy you control | F9 |
| 10 | Med | Open sign-up + enumeration; in-memory auth rate limit | **PARTIAL** — `/api/auth/sign-up/email` now 403 (e2e). Auth rate limiter is still in-memory (per instance) — **OPEN** for multi-instance deploys |  `auth.spec.ts` |
| 11 | Low–Med | No quotas on authenticated writes; unbounded export | **PARTIAL** — evidence cap (10 files/10 MB per case), 10 new cases/hour/customer. Other quotas and streaming export **OPEN** | F11 |
| 12 | Low | Policy rules unvalidated; bad values fail open | **FIXED** — typed rule schema; malformed stored values dropped (fail closed) | F12 |
| 13 | Low | "No" after "yes" could execute; no consent expiry | **FIXED** — answers final, 72 h TTL. Exhausted-attempt re-execution is blocked by the state machine | F13 |
| 14 | Low | Internal rule keys / adapter text visible to customers | **FIXED** — fixed wording; detail kept in internal payload | F14 |
| 15 | Low | GET grant link sets cookie (login CSRF), token in URL, cookie path | **PARTIAL** — sign-out now clears the grant cookie. Interstitial POST exchange and path scoping **OPEN** | — |
| 16 | Low | CSP `unsafe-inline`, no HSTS/COOP | **PARTIAL** — HSTS (production) and COOP added. Nonce-based CSP **OPEN** | — |
| 17 | Low | API-key details | **PARTIAL** — dead `cases:read` scope removed. Rate limit after auth, email-keyed lockout, `Idempotency-Key` semantics (audit-only; replay safety comes from the action id) documented, otherwise **OPEN/ACCEPTED** | — |
| 18 | Low | 32-bit receipt ids | **FIXED** — 64 bits | F18 |
| 19 | Low | Invitation role not validated; invalid dates → 500 | **FIXED** | F3 / cases page |
| S1 | — | Timed-out internal op keeps writing in the open tx | **FIXED** — internal ops are not raced against the timeout | by construction (no dedicated test) |
| S2 | — | Idempotency-key race could alias another request | **FIXED** | suspected-section test |
| S3 | — | `DEMO_MODE` baked at build | **FIXED** — `force-dynamic` | — |

Categories the reviewer found clean: SQL injection, stored/reflected XSS, SSRF, open redirects, tenant isolation (no cross-tenant path found),
hard-coded real secrets.

Still **not** done by anyone: dynamic testing, fuzzing, penetration testing, review of the Better Auth library itself, load/DoS testing.
