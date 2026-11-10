# Escalation workflow: two options

Status: **Prepared in repo.** Configured in eGain: `BLOCKED — no eGain tenant access in this environment`. Tested in eGain: `BLOCKED — no eGain tenant access in this environment`.

The hackathon requires an escalation workflow with at least two escalation or contact options, using demonstration contact details unless live details are authorized (https://www.egain.com/ai-agent-hackathon/). eGain's public release notes describe an escalation workflow that "run[s] when the AI Agent determines that a conversation needs to be escalated" and can "gather additional context, notify a team, route the …" conversation (search excerpt of https://ebrain.egain.com/kb/updates/content/EASY-17875/Enhancements-21232, whose page renders client-side so only the excerpt was read), and that it pre-fills the escalation form with details captured earlier, such as email, phone and an issue summary (21.23.0 release notes, https://ebrain.egain.com/kb/updates/content/EASY-17453/Enhancements-21230, as summarised by a search tool). The exact configuration is `UNVERIFIED — confirm in the trial UI`.

Do not configure live chat escalation. Public notes say it needs Conversation Hub queues and a chat entry point URL (https://ebrain.egain.com/kb/updates/content/EASY-16410/Enhancements-2122, search excerpt), which is out of scope and not needed for two non-live options.

## The two options

| | Option 1: Callback request | Option 2: Email follow-up |
|---|---|---|
| Label shown to the customer | Callback request | Email follow-up |
| Demonstration contact detail shown | +1 (555) 010-0100 | support@demo.orylo.example |
| Orylo channel value | `callback_request` | `email_request` |
| What the customer is asked | Preferred time window (free text, for example "tomorrow morning") | Nothing further |
| What the customer is told | "A person will call. The number shown is a demonstration number." | "A person will email. The address shown is a demonstration address." |

Both detail strings are fictional. No real number, address or mailbox is implied. Do not replace them with real contact details.

## Layer 1: eGain escalation workflow (works without the Action)

The eGain escalation workflow presents the two options with the demonstration details above, whether or not Orylo can be reached. This alone satisfies the "at least two escalation or contact options" requirement. It must work on its own in "Test AI Agent" and on the published link.

Message:

> "I can arrange either of these:
> 1. Callback request — a person phones you (demonstration number: +1 (555) 010-0100).
> 2. Email follow-up — a person emails you (demonstration address: support@demo.orylo.example).
> Which would you prefer?"

## Layer 2: tracked record in Orylo (requires the Action)

After the customer chooses, and only if a `caseReference` and a valid `customerToken` exist, call:

`POST /api/v1/egain/cases/{caseReference}/escalations` with `X-Customer-Token`, body:

```json
{ "channel": "callback_request", "reason": "<=500 characters, see below>" }
```

or `"channel": "email_request"`. The API returns `{ "escalationId", "status": "OPEN", "channel", "message" }`. Each call creates a tracked escalation record with an owner queue in Orylo. Tell the customer the returned `message`, then: "I've sent what we've covered, so you won't need to repeat it." Do not tell them who will contact them or when unless the `message` says so.

If the API returns `CONFLICT` (an open escalation already exists), say "You already have a follow-up request open for this case." and do not create another. If it fails twice, say the request could not be recorded and that the demonstration contact details above remain the route; never claim it was recorded.

## When each option is offered

Both options are always offered together. Never push one over the other.

Offer them:

- Immediately when the customer asks for a person, a callback, an email, a supervisor or a human (intent I-10), at any step.
- After verification fails twice (`knowledge/identity-verification.md`, `knowledge/escalation-policy.md`).
- When the backend reports an escalated case: account not found, no charge found, no safe automatic action, lookup failed, or timeout.
- When a step fails twice, or the result cannot be read back and confirmed (`knowledge/error-failure-handling.md`).
- When two policies disagree or a superseded version is cited (`knowledge/policy-authority-manifest.md`).
- When the question is outside the documents (U-04), requires legal advice (U-02), asks for a refund promise (U-01), or concerns another person's account (U-03), after declining.
- After a partial resolution, as an optional offer (one time).
- When the customer repeats the same complaint twice without a new fact: summarise once, then offer the options rather than looping.

Do not offer them as a way to avoid answering a question that the knowledge base answers.

## Context passed (the `reason` string and the eGain escalation form)

Escalation policy: every escalation carries the customer's description, what was checked, what was tried, what failed, and what the customer already confirmed.

Build `reason` (maximum 500 characters; truncate the oldest detail first, never the "failed" or "confirmed" parts):

```
Channel: {callback|email}. Window: {preferred window or n/a}.
Described: {issueCategory}: {issueSummary, shortened}.
Checked: {for example: identity verified; earlier cancellation found 9 days ago; account active; $29.99 charge 3 days ago}.
Tried: {for example: cancellation correction executed (verified), receipt {receiptNo}}.
Failed: {for example: billing review failed twice, not confirmed | none}.
Confirmed by customer: {step names the customer said yes to | nothing}.
```

Never include `customerToken`, passwords, payment data, or anything the customer has typed that looks like such data. Do not include `accountNumber` in the reason unless Orylo's owner queue needs it; the `caseReference` already identifies the case.

For the eGain-side form, pre-fill from session variables `fullName`, `email`, `issueCategory`, `issueSummary` and `caseReference` where the trial allows (`UNVERIFIED — confirm in the trial UI`). A phone number is not collected (see `prechat.md`); the callback uses the demonstration number only.

## Mapping to the Action API

| Customer choice | Endpoint | Channel | Preconditions |
|---|---|---|---|
| Callback request | `POST /api/v1/egain/cases/{caseReference}/escalations` | `callback_request` | `caseReference`, `customerToken` |
| Email follow-up | same | `email_request` | same |
| No case exists (verification failed) | none | none | Layer 1 only; state this plainly |

## Tests

See `test-scripts.md`, scenario T10 (both options) and the verification-failure and failed-step scenarios.
