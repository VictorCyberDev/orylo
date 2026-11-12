# Owner actions — what only you can do in eGain (and then I re-test)

Written 2026-11-12. **Deadline you must treat as binding: Nov 13 2026 05:30 WAT** (Devpost cutoff; the organizer page says later, so use the earlier). Everything below needs your eGain login, which this environment does not have. Everything I could do without it is done (see the end of this file). Do the steps in this order — each is independent value, and 1–3 take about 20 minutes together.

For each step, the **check** is a command I (or you) can run; paste me the output or a screenshot of eGain's *Test AI Agent* and I will update the evidence.

## 1. Allow the site's origin (2 minutes) — fixes the chat bubble on the real site

In the agent's settings, find the list of **allowed domains / trusted origins** (the label may read *Allowed domains*, *Trusted origins*, *CORS*, or sit under the channel/embed settings) and add exactly:

`https://orylo-demo.vercel.app`

(no path, no trailing slash). Save and publish. **Do not** add a proxy or any other domain.
*Why:* eGain's API answers the browser's CORS check only for `https://ai.egain.cloud`; for our origin it sends no `Access-Control-Allow-Origin` (captured in `docs/evidence/egain-live/widget-preflight-2026-11-12.txt`).
*Check:* `npx playwright test -c playwright.live.config.ts origin` (2 tests; the first must pass), then the two real-widget tests in `public`.

## 2. Re-upload five changed policy documents (10 minutes) — fixes K08, K10 and the false-completion wording

The cause was in our own text: `refund-review-rules` said *"Say that a review has been opened"* unconditionally, which taught the agent to claim it. The five files below now say it only after the system confirms, add who decides, add the status vocabulary, and make "offer both callback and email" explicit. Replace these in the agent's knowledge (HTML versions are in `egain/upload-pack/html/`, PDFs in `egain/upload-pack/pdf/`) and republish; the other seven are unchanged:

| File | SHA-256 of the source text (first 16) |
|---|---|
| `billing-policy` | `5a848549e69dcb47…` |
| `refund-review-rules` | `d2ceb060c783b842…` |
| `escalation-policy` | `641d21cfe593249c…` |
| `error-failure-handling` | `1f70069c46ed32c3…` |
| `policy-authority-manifest` | `e4a45227c6c4b6d2…` |

*Check:* `npm run test:live` then `npm run test:live:summary` (13 knowledge cases, plus the guardrail cases).

## 3. Add the guardrail to the agent's instructions (5 minutes) — stops invented completions

Paste into the agent's instructions / behaviour rules (wording is yours to adjust; keep the meaning):

> You are Northfield Digital's customer-support assistant. You explain Northfield's written policies and guide the customer to the next step. **You cannot change an account, apply a cancellation, open a billing review, forward or create a case, schedule a callback, send an email, or issue a refund.** Answering a question, explaining a policy or receiving the customer's confirmation is **not** performing an action.
> Use these words only when they are true, and say which one applies: *policy guidance provided · request received · action proposed · consent obtained · submitted · executed · verified · billing review pending · escalation requested · escalation created · refund completed.* A later word is true only when a connected system has confirmed it. **If no connected system has confirmed a step, say plainly that the step has not been completed yet.**
> Never say "I have applied…", "a review has been opened", "your case has been forwarded", "a callback has been scheduled" or "an email has been sent", and never invent a reference number, time or outcome. Never say or imply a refund will be issued; a billing review is decided by the billing team.
> When the customer asks for a person, offer both options: a **callback request** or an **email follow-up**.

*Check:* `npx playwright test -c playwright.live.config.ts guardrail` — five cases G1–G5; each needs both "no false claim" **and** a plain "not done" statement.

## 4. Escalation workflow with both options (15 minutes) — fixes K10 and W4

Follow `egain/escalation.md`. Two distinct options offered together whenever the customer asks for a person, says the automated step failed, or disagrees with the outcome: **Callback request** and **Email follow-up**. Replace the generic *"Please contact our customer care"* default. **Wording rule:** unless a tool actually created a record, the agent says *"I have taken down your request details; this demonstration cannot schedule a real call/send a real email"* — never "scheduled", "created" or "sent".
*Check:* the five phrases in the mandate (`I want to speak to a human`, `Call me about this case`, `Please follow up by email`, `I don't agree…`, `The automated action failed`) in *Test AI Agent* and on the public page; both options must appear each time.

## 5. Pre-chat form (15 minutes)

Follow `egain/prechat.md`. Minimum fields: full name, email on the account (needed for identity verification), **fictional** account number (pattern `NF-######`), topic (single choice), short description, and a "this is a demonstration, fictional data only" tick. **Never** passwords or card details.
*Check:* run the form in *Test AI Agent*; screenshot the captured variables.

## 6. Guided process workflow bound to the cancellation intent (20–30 minutes)

Follow `egain/workflows/failed-cancellation-guided-flow.md` and `egain/intents.md` (intent I-02). Publish and bind. If you have no outbound HTTP action (step 7), build the **informational variant**: it explains the policy, collects consent wording, and ends with the two escalation options — and **must not** say anything was applied or verified.
*Check:* the scripts in `egain/test-scripts.md`, in *Test AI Agent* and on the published page.

## 7. HTTP action to Orylo (only if your trial has one; 20 minutes) — the competitive demonstration

First find out whether the workflow editor has a step that calls an external service (API / HTTP / webhook / connector / action) and a secret store; note the answer in `egain/entitlement-audit.md`. If yes:
1. Open `https://orylo-demo.vercel.app/demo`, enter the reviewer code (I give it to you privately — it is in my scratchpad file `orylo-demo-secrets.env`), sign in as **owner@northfield.example**, go to **Admin → API keys**, create a key named `egain`. It is shown once. Put it **only** in eGain's secret store — never in a workflow variable, transcript, knowledge file or the repository.
2. Create the four calls in `egain/action-contracts/README.md` (sessions → case → confirm → escalations), `Authorization: Bearer <key>`, a stable `Idempotency-Key`, at most one retry reusing the key. Branch on `error.code`, not on HTTP status.
3. If a response field is missing, the agent must not say "Verified".
*Check:* ask me to run the evidence collector: the Orylo side will show the request, the audit entry and the receipt. **I verified the gateway itself with a client I control (14 of 14 checks, `docs/evidence/public/gateway-live.json`); that is not an eGain-originated call and is not counted as one.**
If the trial has no such step, tell me — I will document the limitation and the entry should use the informational variant and say so.

## 8. Video and submission

* The current honest recording is `docs/evidence/video/orylo-demo.mp4` (also at `https://orylo-demo.vercel.app/orylo-demo.mp4` once deployed). Once steps 1–7 work I re-record it with the real widget and the real native workflow; that is a 10-minute job after your confirmation.
* Devpost requires a **YouTube/Vimeo-style link**: upload the file to your own channel (unlisted is fine) and put the URL in the Devpost entry; paste `docs/hackathon/devpost-update.md`.
* Organizer form (https://www.egain.com/ai-agent-hackathon-project-submission/): description = Version C in `docs/hackathon/submission-description.md`; tick only the capabilities you have actually seen working in *Test AI Agent*. **Do not tick the "Publication and testing confirmation" unless pre-chat, escalation (two options) and the process workflow are published and tested.** If they are not, submit with an accurate description instead of ticking it, or contact psai@egain.com about eligibility.

## What I have already done (no action needed)

* Production gateway verified end to end with a temporary key (now revoked): authentication, no account enumeration, consent validation, idempotent replay, the $50 approval threshold, receipt verification incl. tamper rejection, callback + email records, cross-customer isolation, rate limiting, operator-console read-back — `docs/evidence/public/gateway-live.json`.
* Root cause of the false completions found in our policy text and fixed at the source; 139 database tests pass; upload pack rebuilt with hashes.
* Added regression cases: `tests/live/guardrail.live.spec.ts` (G1–G5), `tests/live/origin.live.spec.ts`, `tests/live/gateway.live.spec.ts`.
