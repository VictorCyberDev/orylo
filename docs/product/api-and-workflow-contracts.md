# API and workflow contracts

**Status / what this describes:** The HTTP routes under `src/app/api` and the `WorkflowSpec` format in `src/workflows/spec.ts`, as implemented on 2026-11-10. Read from the route handlers, zod schemas, `src/lib/api.ts`, `src/domain/errors.ts` and `src/workflows/definitions.ts`. The five eGain endpoints are contract-tested against a local server by `tests/e2e/egain-api.spec.ts`. They are **not deployed**, and no call from eGain has ever been made (see `egain/README.md`). Where this document and `egain/action-contracts/openapi.yaml` disagree, this document describes the code; the differences are in section 4. Data is synthetic; "Orylo" is an uncleared working name.

## 1. HTTP API

### 1.1 Conventions

- **Error envelope:** `{ "error": { "code": string, "message": string } }`. Unknown failures give `500` with code `INTERNAL` and message `Unexpected error`; stack traces are never returned (tested).
- **Headers on routes using `handle()`:** `Cache-Control: no-store`; `x-request-id` (echoes the request's value truncated to 64 characters, otherwise a new UUID); `Retry-After` on `429`. Global headers from `next.config.ts` include `X-Content-Type-Options: nosniff`, a CSP, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin` and, in production only, `Strict-Transport-Security`; `x-powered-by` is removed (nosniff and the missing `x-powered-by` are tested).
- **Request body:** at most 64 KB when `Content-Length` is present; must be valid JSON; unknown properties are rejected (`.strict()`). Validation failures are `400 VALIDATION` with messages like `email: Invalid email address`, joined by `; `.
- **Not wrapped by `handle()`:** `/api/health`, `/api/evidence/[id]`, `/api/admin/export` and `/api/auth/*`. They do not set `x-request-id`, and an unexpected error in the evidence or export routes would surface as the framework's default 500.

### 1.2 Error codes and statuses (`src/domain/errors.ts`)

| Code | Status | Code | Status |
|---|---|---|---|
| `VALIDATION` | 400 | `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 | `NOT_FOUND` | 404 |
| `CONFLICT`, `ILLEGAL_TRANSITION`, `POLICY_STALE`, `STALE_STATE` | 409 | `POLICY_DENIED`, `CONSENT_REQUIRED`, `APPROVAL_REQUIRED`, `UNSUPPORTED` | 422 |
| `RATE_LIMITED` | 429 | `ADAPTER_FAILURE`, `ADAPTER_DENIED` | 502 |
| `ADAPTER_TIMEOUT` | 504 | `INTERNAL` | 500 |

On the eGain routes, provider failures at execution time come back as `200` with `status: "FAILED"`, not as `502`.

### 1.3 Authentication

| Layer | Used by | Rule |
|---|---|---|
| API key `Authorization: Bearer oryk_…` | all `/api/v1/egain/*` | Key found by SHA-256 hash and not revoked; must carry scope `egain:actions` (else `403`); the organization's plan must include API access and its subscription must be active (else `403`). Missing or unknown key: `401`. |
| `X-Customer-Token` | the three case routes | Opaque token from `POST /sessions`; valid 30 minutes, same organization as the key, not revoked; its customer must own the case. Missing or bad: `401`. Another customer's case, or a token scoped to a different case: `404`. |
| Session cookie | `/api/evidence/[id]`, `/api/admin/export` | Staff or customer session; none: `401`. Export also needs `export.run`. |
| None | `/api/health`, receipt verification | |

### 1.4 Rate limits (Postgres fixed window)

| Scope | Limit |
|---|---|
| API key, all eGain routes | 120 per 60 s per key |
| Identity verification (`POST /sessions`) | 6 per 600 s per key and email (`Retry-After: 600`) |
| Receipt verification | 60 per 60 s per client IP hash (`x-real-ip`, else the right-most `x-forwarded-for` entry; absent headers share one bucket) |
| Lead form and "open a case" (server actions, not HTTP API) | 5 per 600 s per IP hash; 10 per hour per customer |
| Sign-in / password reset (Better Auth) | 8 / 3 per 60 s; other auth routes 60 per 60 s |

### 1.5 Endpoints

**`GET /api/health`** — no auth. `200 {"status":"ok","db":"up"}`; `503 {"status":"degraded","db":"down"}`.

**`POST /api/v1/egain/sessions`** — API key. Verifies identity (email and account number must belong to the same customer), then opens or resumes the customer's open failed-cancellation case.

Request:
```json
{ "fullName": "string 1-120", "email": "email, max 200 (trimmed)", "accountNumber": "string 3-40", "issue": "string 1-1000" }
```
Responses: `200 {"verified":false,"message":"We couldn't verify those details…"}` (identical for a wrong email, a wrong account and an unknown account); `200 {"verified":true,"caseReference":"ORY-1001","customerToken":"…","state":"READY_FOR_ACTION","summary":"Earlier cancellation request found; account still active; a recent charge of $149.00."}`. Errors: `400`, `401`, `403`, `429`.

**`GET /api/v1/egain/cases/{ref}`** — API key and customer token.
```json
{ "caseReference": "string", "state": "CaseState", "stateLabel": "string",
  "findings": { "priorCancellationFound": bool, "priorCancellationAt": "ISO|null", "accountStillActive": bool,
                "disputedCharge": { "amountCents": int, "chargedAt": "ISO", "description": "string" } | null },
  "objectives": [{ "key": "string", "label": "string", "status": "PENDING|IN_PROGRESS|COMPLETED|VERIFIED|BLOCKED|NOT_APPLICABLE" }],
  "proposedActions": [{ "actionId": "uuid", "operation": "string", "label": "string", "consentText": "string",
                        "needsApproval": bool, "status": "PROPOSED|AWAITING_APPROVAL|CONFIRMED" }],
  "ledger": [{ "requestedOutcome", "executionResult", "finalOutcome", "verifiedAt", "summary", "receiptRef" }],
  "escalations": [{ "status": "string", "channel": "string" }] }
```
`needsApproval` is true only once the request is in `AWAITING_APPROVAL`, that is, after the customer has consented. `consentText` is to be shown verbatim before consent. Errors: `401`, `403`, `404`, `429`.

**`POST /api/v1/egain/cases/{ref}/actions/{actionId}/confirm`** — API key and customer token. Header `Idempotency-Key` required, matching `^[A-Za-z0-9_.:-]{8,120}$`. Body `{"consent": boolean}` (strict).
```json
{ "status": "EXECUTED|DUPLICATE|DECLINED|AWAITING_APPROVAL|FAILED", "receiptNo": "string|null",
  "verification": { "verified": bool, "summary": "string" } | null, "caseState": "CaseState", "message": "string" }
```
`DECLINED` records a no and changes nothing. A recorded answer is final: the opposite answer afterwards is `409 CONFLICT`. `AWAITING_APPROVAL` means the amount exceeds the threshold and a team member must approve; calling again after approval executes it. `DUPLICATE` replays the original receipt with `verification: null`. `FAILED` carries the failure code and whether a retry is safe in `message`. A confirmation older than 72 hours is refused with `CONSENT_REQUIRED`, which this route reports as `status: "FAILED"`. Idempotency is enforced per action id: the header is validated and written to the audit log as a hash prefix, but it is not stored for replay matching. Errors: `400`, `401`, `404` (action not on this case), `409` (`STALE_STATE`, `POLICY_STALE`, `CONFLICT`), `422` (`POLICY_DENIED`), `429`.

**`POST /api/v1/egain/cases/{ref}/escalations`** — API key and customer token. Body `{"channel":"callback_request"|"email_request","reason":"string 1-500"}` (strict). Response `200 {"escalationId":"uuid","status":"OPEN","channel":"…","message":"…"}`. Repeating the same channel while one is open returns the same `escalationId` with `200`. Creating one moves the case to `ESCALATED`; where that transition is illegal (for example `VERIFIED_RESOLVED`) the answer is `409 ILLEGAL_TRANSITION`.

**`GET /api/v1/receipts/{no}/verify`** — no auth. `no` must match `^RCPT-\d{8}-[A-F0-9]{16}$` (16 hex digits). Valid and signature intact: `200 {"valid":true,"receipt":{"receiptNo","operation","issuedAt"}}`. Anything else: `404 {"valid":false}`. Returns nothing about the customer or case. `429` possible.

**`GET /api/evidence/{id}`** — session. Returns the file as an attachment with `nosniff`, `Cache-Control: private, no-store` and `Content-Security-Policy: sandbox`. `401`, plus `403`/`404` for files the caller may not read.

**`GET /api/admin/export`** — staff session with `export.run`. JSON attachment of the organization's data. Anonymous: `401` (tested).

**`/api/auth/[...all]`** — Better Auth handler (sign-in, sign-out, password reset, session). Public sign-up is closed: `POST …/sign-up/email` answers `403 {"error":{"code":"FORBIDDEN","message":"Sign-up is by invitation only"}}`; accounts come from invitations or seeding. Not documented further here.

## 2. Operations the gateway accepts

`propose_actions` nodes name one of these (`src/domain/actions.ts`). Each is validated by a strict zod schema, checked against approved policy rules, and verified by read-back.

| Operation | Input | Consent | Staff only | Objective | Policy rules required |
|---|---|---|---|---|---|
| `subscription.correct_cancellation` | `accountNumber` | yes | no | `stop_future_billing` | `cancellation.correction_allowed`, `cancellation.correction_window_days` |
| `subscription.create_billing_review` | `accountNumber`, `chargeId` (uuid) | yes | no | `billing_review_submitted` | `billing.review_allowed`, `billing.review_window_days` |
| `billing.record_review_decision` | `accountNumber`, `chargeId`, `decision` (`APPROVED_FOR_REFUND_PROCESSING`, `DENIED`) | no | yes | `charge_disposition` | `refund.automatic_refund_allowed` (must be false) |
| `internal.create_reschedule_request` | `preferredWindows[1-5]`, `contactMethod` | yes | no | `reschedule_requested` | `service.reschedule_allowed` |
| `internal.confirm_reschedule` | `newSlot` | no | yes | `new_appointment_confirmed` | `service.reschedule_allowed` |
| `internal.assemble_claim_packet` | `serialNumber`, `purchaseDate`, `issue` | yes | no | `claim_packet_ready` | `warranty.coverage_months` |

## 3. Workflow contract (`WorkflowSpec`)

### 3.1 Shape

```ts
{ key: /^[a-z][a-z0-9-]{2,60}$/, name: 3-120, category: /^[a-z][a-z_]{2,40}$/, description?: ≤500,
  trigger: { event: "case.opened", category: string },
  policyAuthority: string[] (default []), requiredRole: "customer"|"operator"|"system" (default "system"),
  objectives: [{ key, label, required: bool (default true) }]  // at least 1
  start: nodeId, nodes: Node[]  // 2 to 40
  completion: "all_required_objectives_verified" }
```
Every node has `id` (`/^[a-z][a-z0-9_]{1,40}$/`), `label` (1-120) and a `type`:

| Type | Fields | Behaviour |
|---|---|---|
| `lookup` | `source: "subscription_diagnosis"`, `next`, `retry?{maxAttempts 1-5}`, `onError?` | Reads account, earlier cancellation requests and charges from the provider; case → `INVESTIGATING`. A retryable error waits and is retried when the case is next advanced; after the limit it goes to `onError`. |
| `decision` | `branches[{when: Condition[] (≥1), next}]` (≥1), `default` | First branch whose conditions all hold; else `default`. |
| `collect_info` | `fields[{key, label, type: text\|date\|text_list\|choice\|evidence, options?, required}]`, `next` | Missing required fields → `AWAITING_CUSTOMER_INFORMATION` and wait; when complete → `INVESTIGATING`. Dates also set `<key>IsPast`. A `choice` field without `options` can never be satisfied; save-time validation does not catch it. |
| `set_objective` | `objectiveKey`, `status: NOT_APPLICABLE\|IN_PROGRESS\|BLOCKED`, `detail ≤300`, `next` | Cannot set `VERIFIED`; only gateway verification can. |
| `propose_actions` | `actions[{operation, input: Record<string,string>}]` (≥1), `next` | Case → `READY_FOR_ACTION`; creates consent-pending requests. Input values starting `$.` are read from the execution context. A refused proposal escalates and goes to the first `HANDED_OFF` end node. Operation names are not checked at save time. |
| `await_objectives` | `objectives[]` (≥1), `timeoutHours?`, `onTimeout?`, `next` | Waits until each is `VERIFIED` or `NOT_APPLICABLE`. Timeout is checked only when the case is advanced. |
| `escalate` | `reasonCode`, `reason ≤500`, `queueKey?`, `next?` | Creates an escalation; case → `ESCALATED`. No `next` ends the run. |
| `end` | `outcome: RESOLVED\|HANDED_OFF\|NO_ACTION` | Completes the execution. It does not itself mark the case resolved; that is the gateway's verification. |

### 3.2 Condition language

```json
{ "path": "$.findings.accountStillActive", "op": "eq|neq|gt|lt|exists|truthy|falsy", "value": "string|number|boolean (optional)" }
```
`path` matches `^\$\.[A-Za-z0-9_.]+$` and is a dotted lookup into `{ accountNumber, answers, findings, … }`. `eq` and `neq` are strict equality; `gt` and `lt` need numbers on both sides; `exists` means not undefined or null. No expressions, no scripts, no `eval`.

### 3.3 Validation (on save and again on publish)

Unique node ids; `start` exists; every `next`, `onError`, branch target, `default` and `onTimeout` points to a node; `await_objectives` and `set_objective` name declared objectives; every node is reachable from `start`; at least one `end`. Saving needs `workflow.write` and creates draft version n+1; publishing needs `workflow.publish` and a different user than the author, archives the previous published version, and leaves running cases on the version they started on. Both are audited. `trigger`, `requiredRole`, `policyAuthority` and `completion` are accepted but not read by the engine (code search); authority comes from the operation's required rules. At most 40 nodes run per advance.

### 3.4 Worked example: Missed Service Appointment Recovery

From `definitions.ts` (description omitted):

```json
{ "key": "missed-appointment-recovery", "name": "Missed Service Appointment Recovery", "category": "missed_appointment",
  "trigger": { "event": "case.opened", "category": "missed_appointment" },
  "policyAuthority": ["service.reschedule_allowed"],
  "objectives": [ { "key": "reschedule_requested", "label": "Scheduling team has your request" },
                  { "key": "new_appointment_confirmed", "label": "New appointment confirmed by a person" } ],
  "start": "collect",
  "nodes": [
    { "id": "collect", "type": "collect_info", "label": "Appointment details", "next": "check_missed",
      "fields": [ { "key": "appointmentDate", "label": "Date of the missed appointment", "type": "date", "required": true },
                  { "key": "preferredWindows", "label": "When could we come instead? (one per line)", "type": "text_list", "required": true },
                  { "key": "contactMethod", "label": "How should the scheduling team contact you?", "type": "choice", "options": ["email","phone"], "required": true } ] },
    { "id": "check_missed", "type": "decision", "label": "Was the appointment in the past?", "default": "esc_not_missed",
      "branches": [ { "when": [ { "path": "$.answers.appointmentDateIsPast", "op": "eq", "value": true } ], "next": "propose" } ] },
    { "id": "propose", "type": "propose_actions", "label": "Propose a reschedule request", "next": "wait",
      "actions": [ { "operation": "internal.create_reschedule_request",
                     "input": { "preferredWindows": "$.answers.preferredWindows", "contactMethod": "$.answers.contactMethod" } } ] },
    { "id": "wait", "type": "await_objectives", "label": "Wait for a confirmed slot",
      "objectives": ["reschedule_requested","new_appointment_confirmed"], "timeoutHours": 72, "onTimeout": "esc_timeout", "next": "done" },
    { "id": "done", "type": "end", "label": "New appointment confirmed", "outcome": "RESOLVED" },
    { "id": "esc_not_missed", "type": "escalate", "label": "Appointment is not in the past", "reasonCode": "NOT_MISSED",
      "reason": "The appointment date is not in the past; a person should check the booking.", "queueKey": "field-scheduling", "next": "handed" },
    { "id": "esc_timeout", "type": "escalate", "label": "No slot confirmed in time", "reasonCode": "TIMEOUT",
      "reason": "No new appointment was confirmed in time.", "queueKey": "field-scheduling", "next": "handed" },
    { "id": "handed", "type": "end", "label": "Handed to a person", "outcome": "HANDED_OFF" } ] }
```

Walk-through: the case opens and the engine stops at `collect` in `AWAITING_CUSTOMER_INFORMATION`. When the customer supplies the three fields, the case returns to `INVESTIGATING`, `check_missed` branches on the date, and `propose` moves the case to `READY_FOR_ACTION` with one consent-pending request. After consent the gateway hands the request to the `field-scheduling` queue and verifies the hand-off (objective `reschedule_requested`). The second objective needs a person to record the slot (`internal.confirm_reschedule`). Only then is every required objective verified and the case `VERIFIED_RESOLVED`. Tested at domain level in `workflows-and-modules.test.ts` ("Workflow 2"); not in a browser.

## 4. Discrepancies with `egain/action-contracts/openapi.yaml`

No test loads the YAML or validates responses against it, so these differences are not detected automatically.

| # | OpenAPI says | Implementation does |
|---|---|---|
| 1 | `403 FORBIDDEN` when the customer token does not belong to the case | `404 NOT_FOUND` (tested). `403` only for a key without the scope, or a plan without API access or an inactive subscription. |
| 2 | Receipt verify returns `200` with `{valid:false}`; `404` uses the error envelope; `receiptNo` is any string (example `EXAMPLE-RECEIPT-0001`) | `404 {"valid":false}` for unknown and malformed numbers; numbers must match `RCPT-YYYYMMDD-` plus 16 uppercase hex digits, so the example would be rejected. |
| 3 | `409` when an open escalation already exists | `200` with the existing `escalationId` and "You already have an open request on this case." (tested). `409` only for `ILLEGAL_TRANSITION`. |
| 4 | `Error.code` enum lists 10 codes; no `500` response | Also emits `ILLEGAL_TRANSITION`, `POLICY_STALE`, `UNSUPPORTED`, `ADAPTER_*` (domain level) and `INTERNAL` with `500`. |
| 5 | Examples use `caseState: IN_PROGRESS` and `stateLabel: "Ready for your confirmation"` | `IN_PROGRESS` is not one of the 14 states; the label for `READY_FOR_ACTION` is "Ready for action". |
| 6 | `DUPLICATE` example has `verification: {verified:true,…}`; same `Idempotency-Key` never applies twice | `DUPLICATE` returns `verification: null`. The header must match `^[A-Za-z0-9_.:-]{8,120}$` (OpenAPI gives length only) and is logged, not matched; replay safety comes from the action id. A different key on the same action replays; the same key on another action is not rejected. |
| 7 | `fullName`, `email`, `accountNumber` have no length limits; `accountNumber` has no minimum | `fullName` 1-120, `email` ≤200, `accountNumber` 3-40; body ≤64 KB. |
| 8 | No rate limits or `Retry-After` described; message "Too many requests. Try again shortly." | 120/min per key, 6 per 10 min per key and email on sessions, 60/min per IP on receipts; `Retry-After` set; message "Too many attempts. Please wait a moment and try again." |
| 9 | `ProposedAction.operation` is one of two operations | The case route returns whatever the case holds, so a missed-appointment or warranty case returns `internal.*` operations. |
| 10 | Example messages ("Your cancellation has been applied.", "…; one recent charge.") | Different wording ("Done. The result was read back from the subscription system."; "…a recent charge of $149.00."). Cosmetic. |
| 11 | Not described | `/api/health`, `/api/evidence/[id]`, `/api/admin/export`, `/api/auth/*` exist. The only API scope that can be issued is `egain:actions`. |
