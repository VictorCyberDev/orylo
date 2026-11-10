# Product requirements document

**Status / what this describes:** The requirements for the Orylo demonstration product as it exists in the repository on 2026-11-10, and the gaps that remain. Written from the code and the automated tests, not from user research. No customer or operator has used it. All data is synthetic. "Orylo" is an uncleared working name. Market and persona statements are `Hypothesis (unvalidated)` and are defined in `docs/strategy/`; this document does not restate or strengthen them.

Evidence tags used below:

| Tag | Meaning |
|---|---|
| `Built & tested` | Implemented, and the behaviour is asserted by a Playwright test in a real browser or over real HTTP (`tests/e2e/`). |
| `Built, not browser-tested` | Implemented. Covered at most by domain-level tests against a real database (`tests/integration/`, `tests/unit/`, `tests/security/`), or by an axe/overflow page scan only. The evidence column says which. |
| `Roadmap` | Not built, or built only as a setting or stub. |

## 1. Problem

Hypothesis (unvalidated): when a customer has already asked to cancel and is charged again, support tools record activity (a chat ended, a ticket closed) rather than outcome (the subscription stopped, the charge is under review). The customer repeats the story, and the company cannot tell whether the fix held. See `docs/strategy/01-founding-vision.md`.

## 2. Goals and non-goals

| Goals | Non-goals |
|---|---|
| G1. The customer never starts over: history is found, not re-asked. | Moving money, issuing refunds, or implying one. Orylo opens a billing review and records a person's decision. |
| G2. Status is truthful: "Verified resolved" appears only after read-after-write evidence. | Replacing the helpdesk or being a chatbot. |
| G3. Consent comes before any change, with the exact wording stored. | General automation or RPA. The action set is six typed operations. |
| G4. Every change passes one governed gateway: policy, consent, approval, idempotency, receipt. | Compliance or certification claims. None is held. |
| G5. Operators see evidence and a reason before they see buttons. | Live integrations. Only a simulated subscription provider exists. |
| G6. A person can always take over, with context. | Proving demand. No discovery has been done. |

## 3. Scope

**In (built):** three workflows (Failed Cancellation and Billing Recovery; Missed Service Appointment Recovery; Warranty Claim Readiness, the last two with internal steps only); customer portal; operator console; organization admin; five-endpoint HTTP action API for an eGain agent; marketing site; test-mode billing.

**Out (Roadmap):** real subscription, billing, scheduling or claims connectors; outbound email; a scheduler that sweeps workflow timeouts (the sweep function exists, nothing calls it on a schedule); retention purge (the retention days are stored as a setting, and no job deletes anything); customer data export or deletion; SSO and MFA; localisation (English only); a deployed host (the API has never been called by eGain); the "Digital commerce exceptions" and "General customer operations" solutions, which `/solutions` labels as roadmap.

## 4. Functional requirements

### A. Access and identity

| ID | Requirement | Tag | Evidence |
|---|---|---|---|
| A1 | One sign-in page; customers land in `/portal`, staff in `/app`; an unsafe `next` target is ignored; a wrong password gives a non-leaky error. | Built & tested | `journey.spec.ts` (open-redirect, wrong-password, role landing) |
| A2 | Sign-out ends the session; protected routes redirect to sign-in; the session cookie is httpOnly and SameSite=Lax. | Built & tested | `auth.spec.ts` |
| A3 | Password-reset request gives the same answer whether or not the account exists. Reset with a valid token. | Built & tested (request, invalid token); valid-token reset Built, not browser-tested | `auth.spec.ts` |
| A4 | Reset and notification email delivery. | Roadmap | The email adapter records `SKIPPED`; the UI says no email is sent. |
| A5 | Staff invitations: single-use, expiring, bound to the invited address; the last owner is protected. Public self-registration is closed (`POST /api/auth/sign-up/email` answers 403); accounts come from invitations or seeding. | Built, not browser-tested | `workflows-and-modules.test.ts`; invalid token tested in `auth.spec.ts`; the sign-up block is read from code only |
| A6 | Operator-issued 24-hour case link so a customer can view one case without a password. The link is read-only (it cannot consent, confirm, escalate, upload or cancel) and limited to that case. | Built, not browser-tested | Domain rules: `tests/security/review-findings.test.ts` (F1, F2). No test covers `/portal/access/[token]` or the issuing action. |
| A7 | Customers cannot read another customer's case or reach the console; tenants are isolated. | Built & tested | `journey.spec.ts` (404, redirect); `policy-and-isolation.test.ts` |

### B. Intake and diagnosis

| ID | Requirement | Tag | Evidence |
|---|---|---|---|
| B1 | Customer opens a case by choosing what happened (three options). | Failed cancellation: Built & tested. Other two: Built, not browser-tested | `journey.spec.ts`; `workflows-and-modules.test.ts` |
| B2 | Diagnosis shows what was found and what is not known; nothing is claimed verified before action. | Built & tested | `journey.spec.ts` ("What we know", "0 of 3 verified") |
| B3 | An existing open case is resumed rather than duplicated. | eGain session: Built & tested. Portal "Start a case": Roadmap (always creates a new case) | `egain-api.spec.ts`; code read of `openCaseAction` |
| B4 | Ask only for missing details; accept PNG, JPEG, PDF or text up to 2 MB, checked by type, extension and signature; at most 10 files or 10 MB per case. | Built, not browser-tested | `workflows-and-modules.test.ts` (workflow 3, uploads); `review-findings.test.ts` (case cap) |

### C. Consent, approval, action

| ID | Requirement | Tag | Evidence |
|---|---|---|---|
| C1 | Each proposed step shows its exact consent wording; yes and no are available; the wording is stored. A recorded answer is final, and a confirmation expires after 72 hours. | Yes: Built & tested. No, finality and expiry: Built, not browser-tested | `journey.spec.ts`; `recovery-flow.test.ts` ("customer declines"); `review-findings.test.ts` (F13) |
| C2 | Gateway: typed input, policy authority, consent, current-state check, idempotent execution, signed receipt. | Over HTTP: Built & tested. Failure modes: Built, not browser-tested | `egain-api.spec.ts`; `gateway-safety.test.ts` |
| C3 | A billing review above the approval threshold waits for a different team member. | Wait state over HTTP: Built & tested. Approve and decline in the console: Built, not browser-tested | `egain-api.spec.ts`; `recovery-flow.test.ts` |
| C4 | Stale account state, stale consent or a superseded policy refuses the action and asks again. | Built, not browser-tested | `gateway-safety.test.ts`; `policy-and-isolation.test.ts` |

### D. Verification and record

| ID | Requirement | Tag | Evidence |
|---|---|---|---|
| D1 | Each objective is tracked and verified separately; a partly done case is shown as partial. | Built & tested | `journey.spec.ts` ("2 of 3 verified", "No money has moved") |
| D2 | Only the system can enter Verified resolved, and a database trigger requires ledger evidence. | Built & tested (seen in browser); trigger Built, not browser-tested | `journey.spec.ts`; `recovery-flow.test.ts` (direct SQL refused) |
| D3 | Append-only, hash-chained outcome ledger; audit log; case events. | Built, not browser-tested | `policy-and-isolation.test.ts` (UPDATE and DELETE rejected) |
| D4 | Public receipt verification. | Malformed and unknown numbers: Built & tested. Valid receipt: Built, not browser-tested | `egain-api.spec.ts`; `recovery-flow.test.ts` |

### E. Human support

| ID | Requirement | Tag | Evidence |
|---|---|---|---|
| E1 | Customer requests a callback or an email follow-up; a tracked escalation with a frozen context snapshot is created; repeating is idempotent. | HTTP: Built & tested. Portal form submit: Built, not browser-tested | `egain-api.spec.ts`; `workflows-and-modules.test.ts` |
| E2 | Operator takes ownership, closes, or returns the case to automation. | Built, not browser-tested | `workflows-and-modules.test.ts` |
| E3 | Automation that cannot act safely escalates instead of guessing. | Built, not browser-tested | `gateway-safety.test.ts`; `recovery-flow.test.ts` |
| E4 | Real telephone or email contact. | Roadmap (demonstration contact details only) | `src/config/brand.ts` |

### F. Operator console and admin

| ID | Requirement | Tag | Evidence |
|---|---|---|---|
| F1 | Case detail leads with a recommendation and reason, then evidence, actions, ledger and timeline. Staff can record the billing team's decision. | Built & tested | `journey.spec.ts` |
| F2 | Command centre, case list with filters and sort, approvals, escalations, notifications. | Built, not browser-tested (axe, overflow, one search) | `a11y-responsive.spec.ts`; `search-and-analytics.test.ts` |
| F3 | Command palette (Ctrl or Cmd + K) limited to pages the role may open. | Built & tested | `a11y-responsive.spec.ts` |
| F4 | Roles with least privilege; authors cannot approve their own policy or publish their own workflow. | Built, not browser-tested | `policy-and-isolation.test.ts`; `workflows-and-modules.test.ts` |
| F5 | Policy versions and test question; workflow draft, validate, publish; simulator modes; org settings; test-mode plan changes; JSON export. | Built, not browser-tested (anonymous export refused: tested) | `workflows-and-modules.test.ts`; `egain-api.spec.ts` |
| F6 | API keys shown once, stored hashed, revocable. | Creation in the UI: Built & tested. Revocation: Built, not browser-tested | `egain-api.spec.ts`; `workflows-and-modules.test.ts` |
| F7 | Analytics from stored rows; the savings estimate is labelled as a model. | Built, not browser-tested | `workflows-and-modules.test.ts`; `search-and-analytics.test.ts` |

### G. Channel API and site

| ID | Requirement | Tag | Evidence |
|---|---|---|---|
| G1 | Five HTTP endpoints for an eGain agent (see `api-and-workflow-contracts.md`). | Built & tested (local server only) | `egain-api.spec.ts` |
| G2 | Configuration and publication inside eGain. | Roadmap: blocked, no tenant access | `egain/README.md` |
| G3 | Marketing site, lead form with honeypot and rate limit, legal pages marked draft. `/demo` shows the shared demo password only when `DEMO_MODE=true` (off by default). | Lead form: Built & tested. Pages: axe and overflow only | `journey.spec.ts`; `a11y-responsive.spec.ts` |

## 5. Non-functional requirements

| Area | Requirement | State |
|---|---|---|
| Accessibility | Target WCAG 2.2 AA. No conformance is claimed. | Partly automated; see `accessibility-audit-checklist.md`. |
| Security | Tenant scoping on every query; scrypt passwords via Better Auth; httpOnly cookies; security headers and CSP; rate limits; hashed keys and tokens. | Built; narrow browser coverage. No penetration test. |
| Correctness | Retries never double-apply; concurrent requests produce one mutation. | `gateway-safety.test.ts` |
| Browser and device | Desktop Chrome only is tested, at 375, 820, 1280, 1440 and 1920 px. | No other browsers. |
| Performance | No targets set. No measurements made. | Not tested |
| Hosting | Docker files exist and were not exercised. Nothing is deployed. | Roadmap |

## 6. Success metrics (hypotheses; none achieved or measured)

| Metric | Why it matters | Measurable now? |
|---|---|---|
| Share of opened cases reaching Verified resolved | Tests whether outcome-based status is attainable | Yes, on the analytics page, on synthetic data only |
| Reopen and repeat-contact rate | Tests whether "verified" holds | Yes, same caveat |
| Time to action and to verified resolution | Operator and customer effort | Yes, same caveat |
| Cases where a customer repeats information | Tests "never start over" | No; needs research |
| Correct reading of "partial" and "no money has moved" | Tests the status vocabulary | No; needs usability sessions (`usability-research-plan.md`) |
| Incorrect-success events (Verified without evidence) | Guard metric; the design aims for zero | Invariant tested, not monitored |

## 7. Open questions

1. Who buys: support lead, finance owner or CX executive? Unknown.
2. Should the portal's "Start a case" resume an open case, as the eGain session does?
3. The "Cancel this case" button is shown in every non-closed state, but customers cannot cancel in `ACTION_PENDING`, `ACTION_EXECUTED` or `OUTCOME_PENDING_VERIFICATION`. Hide it, or allow it?
4. Without email, how do customers receive links in a real deployment?
5. Who runs the timeout sweep, and how often?
6. The read-only case link limits the case list, case page and actions to one case, but `/portal/notifications` and `/portal/profile` still show that customer's data, and the decision buttons are still rendered (they fail with "This access link is read-only"). Should the portal hide them for link visitors?
