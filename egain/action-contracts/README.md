# Action contracts

Status: **Prepared in repo.** Registered in eGain: `BLOCKED — no eGain tenant access in this environment`. Tested from eGain: `BLOCKED — no eGain tenant access in this environment`.

`openapi.yaml` is the contract for the five HTTP endpoints that the eGain AI Agent calls on Orylo, the independent backend. It was written as the specification for the engineer implementing the API. It parses as YAML and all of its `$ref` targets resolve (checked locally on 2026-11-10). It has not been run through an OpenAPI linter, has not been tested against a running server, and has not been imported anywhere.

## The five endpoints

| # | Method and path | Purpose | Auth |
|---|---|---|---|
| 1 | `POST /api/v1/egain/sessions` | Verify email and account number; open or resume the case; run the diagnosis; return a 30-minute customer token | API key |
| 2 | `GET /api/v1/egain/cases/{caseReference}` | Findings, objectives, proposed actions with consent text, ledger, escalations | API key + customer token |
| 3 | `POST /api/v1/egain/cases/{caseReference}/actions/{actionId}/confirm` | Confirm or decline one action; idempotent | API key + customer token + `Idempotency-Key` |
| 4 | `POST /api/v1/egain/cases/{caseReference}/escalations` | Record a callback request or email follow-up | API key + customer token |
| 5 | `GET /api/v1/receipts/{receiptNo}/verify` | Public receipt check | none |

API key: `Authorization: Bearer <ORYLO_API_KEY>` with scope `egain:actions`. Customer token: header `X-Customer-Token`. Base URL: `https://<ORYLO_HOST>` (placeholder; no host exists in this package).

HTTP status codes in the YAML are a **proposed** mapping. The error body (`{"error":{"code","message"}}`) is the contract. The eGain workflow should branch on `error.code`, not on the HTTP status.

## What the Action is allowed to do

- `subscription.correct_cancellation`: applies the customer's earlier cancellation, effective from the original request date, after explicit consent.
- `subscription.create_billing_review`: opens a review of the disputed charge. A charge over $50.00 needs a team member's approval, so the result may be `AWAITING_APPROVAL`.
- Nothing else. There is no refund operation. No endpoint moves money.

## Registering it in eGain

Evidence about eGain's trial:

| Question | Evidence |
|---|---|
| Does the hackathon require actions? | `Documented publicly`: "Let the agent take a real action on the customer's behalf" and "Enable and add actions to AI Agent" (https://www.egain.com/ai-agent-hackathon/). |
| Does the hands-on lab cover automated tasks? | `Documented publicly` as one overview sentence: "…designing specialized pre-chat, escalation, and process tool workflows… not only answer questions with precision but also execute automated tasks" (https://share.articulate.com/daJ5S2RJxBQWPP_ijlVud). The lesson content was not retrievable (only the overview and a sign-in form rendered), so the mechanism is unknown. |
| Can a process workflow be added to the agent as a tool? | `Documented publicly` as a search excerpt of the 21.23.5 release note: "When adding a workflow as a tool, administrators define a tool description and select which workflow variables to collect as inputs." (https://ebrain.egain.com/kb/updates/content/EASY-18868/Enhancements-21235; the page renders client-side, so only the excerpt was read.) |
| Can a workflow call an arbitrary HTTP endpoint with a bearer key? | `Not found in public docs.` Searches of eGain's public sites did not surface a description of an HTTP or API-call step in AI Agent workflows. |
| Can an OpenAPI file be imported as actions? | `Not found in public docs.` |
| Are connectors, MCP or API actions included in the trial? | `UNVERIFIED in trial.` eGain markets API, MCP and A2A connections for Agentic Studio (https://www.egain.com/agentic-studio/), a product page that offers "Ask for demo" and says nothing about a trial. |

Therefore the steps below are a plan to try, not a procedure that is known to work. Each step is `UNVERIFIED — confirm in the trial UI`.

1. In the process workflow editor, look for a step type that calls an external service (names might include "API", "HTTP", "Webhook", "Connector", "Action"). Record in `../entitlement-audit.md` what exists.
2. If one exists, create a credential or connection holding `ORYLO_API_KEY` in whatever secret store eGain provides. Do not paste the key into a workflow variable that appears in transcripts, knowledge content, or the repository.
3. Create one call per endpoint (1 to 4). Endpoint 5 is for humans and for the owner's own checks; the agent only quotes the receipt number.
4. Map inputs from the session variables defined in `../prechat.md`: `fullName`, `email`, `accountNumber`, built `issue`. Map outputs to workflow variables: `verified`, `caseReference`, `customerToken` (keep out of the transcript), `state`, `summary`, then the case fields and `status`, `receiptNo`, `verification.verified`, `verification.summary`.
5. Set the `Idempotency-Key` to a value that stays the same on a retry of the same action: the eGain session or conversation id, then `-`, then the `actionId`. If eGain cannot provide a stable session id, build one from `caseReference` and `actionId`. It must be 8 to 120 characters.
6. Set a request timeout and at most one automatic retry. A retry must reuse the same key.
7. Add the workflow to the AI Agent as a tool bound to intent I-02, with a tool description such as "Check the customer's account for an earlier cancellation request and, with their confirmation, apply it and open a billing review." Collect the inputs from the variables, not by asking the customer again.
8. Run the scripts in `../test-scripts.md` in "Test AI Agent" before publishing, and again on the published link.

If a field in the response is missing, the workflow must not substitute a default. In particular, if `verification` is missing or `verified` is not `true`, the agent must not say "Verified".

## Fallback if actions are unavailable in the trial

Decide this by about 2026-11-11 so that there is time to adjust the demo and the description.

| Tier | Condition | What the agent does | What the submission must say |
|---|---|---|---|
| A | An outbound call can be made with a secret | Full flow in `../workflows/failed-cancellation-guided-flow.md` | Normal description |
| B | A workflow can only notify a team or send a webhook without the customer token | The agent cannot read findings or confirm actions. It could pass the collected context to a team as part of the escalation workflow. Whether that reaches Orylo needs a new, unauthenticated or differently-authenticated intake endpoint that this contract does not define. That is a decision for the Orylo owner and engineer, not assumed here. | State that Orylo is not called from eGain; describe the handoff only |
| C | No outbound calls | The agent answers from the policy documents, collects pre-chat details, runs a guided informational process workflow, and offers the two escalation options. It must not present "verified findings", because it has none. | State plainly that the live action requirement is not met in eGain, and that Orylo's actions are shown separately and not as part of the eGain agent |

In every tier the following remain true: the customer-facing agent runs on eGain; no custom chatbot replaces it; nothing is claimed that was not recorded in `../published-agent-acceptance-log.md`.

If the owner chooses to show Orylo's own console alongside, it must be labelled as a separate system and must not be edited into the eGain footage as if the agent had called it.

## Security notes for the implementer

- The key `egain:actions` should only authorise the five endpoints above.
- Customer tokens are bound to one case and expire after 30 minutes.
- Do not log the bearer key or the customer token.
- The API must not reveal whether an account exists on failed verification.
- Never accept a client-supplied price, amount or date as authority; the server decides eligibility from the policy rules.
