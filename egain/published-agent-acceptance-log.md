# Published agent acceptance log (template)

This is an empty template. Nothing has been published, configured or tested on eGain from this repository. Every status is `BLOCKED — no eGain tenant access in this environment` until the owner fills it in from what was observed.

Rules for filling it in:

- Write only what you saw. Leave a row blocked if you did not do it.
- A row is complete only when the Evidence column holds something another person can check (a timestamp, a receipt number, a screenshot filename kept outside the repository).
- Do not put API keys, customer tokens or real personal data in this file.

## 0. Access determination (re-checked 2026-11-11)

Checked before declaring the blocker again, so it is a finding and not an assumption:

- Environment variables: no eGain tenant, credential, API key or URL is set in the build environment.
- Connectors: the connector list is empty for "egain"/"knowledge"/"customer service", and the connector registry has no eGain connector.
- Public rules page (`https://www.egain.com/ai-agent-hackathon/`, fetched 2026-11-11): access is "an existing eGain account or … a trial account with a working email address", and "participation is limited … first-come, first-served". Creating a trial account requires the owner's own email address and acceptance of eGain's terms. This environment will not create accounts, enter credentials or accept terms on the owner's behalf.

**Result: eGain commissioning is BLOCKED** on exactly one thing — the owner creating or using their own eGain trial/account and publishing the agent. Everything on Orylo's side that the eGain agent calls (five HTTP action endpoints, scoped API keys, consent wording, receipts, escalation records) is built and contract-tested in this repository against the OpenAPI document, and nothing in this log claims otherwise. No eGain feature, screenshot, published link or recorded video exists. Use `configuration-guide.md` and `test-scripts.md` once access exists, and fill sections 1–7 only with what is actually observed.

## 0b. What was verified from outside the eGain console (2026-11-11, no login, no credentials)

The owner supplied the public embed values (agent `015f4f90-8772-4065-9e64-894b3615c5d3`, server `https://ai.egain.cloud/r9iv`). Those are widget configuration, not credentials, and let anyone talk to the agent as an anonymous customer. Everything below was observed by doing exactly that.

| Item | Status | Evidence |
|---|---|---|
| The agent exists and answers (name shown: "Orylo", greeting "Hi, how can I help you?") | **VERIFIED** | `docs/evidence/screenshots/egain-demo-desktop-open.png` |
| Widget loads inside Orylo's real pages under a strict CSP, opens from Orylo's button, survives navigation, absent from operator pages; desktop and mobile | **PARTIAL — CORRECTED 2026-11-11.** Passed only with request interception standing in for the origin, which hides eGain's CORS check. On the **real public origin** (`https://orylo-demo.vercel.app`) the widget does **not** load: eGain's details API answers only its own origin. The two real-widget public tests FAIL until the owner adds the origin to the agent's allowed domains. The agent's own page works (video clip, `tests/live/knowledge.live.spec.ts`). | `tests/live/public.live.spec.ts`; `docs/evidence/egain-widget-csp.md` finding 6 |
| Published to the public (anonymous chat works without a login) | **VERIFIED that the embed is live**; whether the owner clicked "publish" for the *current* configuration is **UNVERIFIED** | the above |
| Knowledge: the agent answers the Northfield policies | **PARTIAL (2026-11-11, after the owner's update)** — 11 of 13 live cases pass with cited sources; K08 and K10 fail; W3 shows false action claims; it formerly answered only the repository's engineering topics (0 of 11) | `docs/evidence/egain-live-tests.md`, `docs/evidence/egain-live/knowledge/K01..K13.json`; fix steps: `knowledge-fix.md` |
| Which knowledge sources are configured; whether the 12 files were ingested | **UNVERIFIED** (needs the eGain admin view) — only the symptom is observable | `knowledge-fix.md` |
| Intents (I-01…), pre-chat form, process workflow, escalation options (callback + email) configured and bound | **UNVERIFIED** — the anonymous chat showed no pre-chat form, and K10 ("I want to talk to a real person") returned *"Please contact our customer care for more details."*, which is **not** a callback/email option set. Treat as **not configured** until the owner shows otherwise | `docs/evidence/egain-live/knowledge/K10.json` |
| eGain → Orylo action call | **BLOCKED** — (1) ~~no public URL~~ resolved: Orylo is public, (2) whether the trial can call an external HTTP API is **UNVERIFIED** and needs the admin UI | — |
| Published demo link | `https://orylo-demo.vercel.app/demo` — **deployed and public** (2026-11-11) | `docs/evidence/public/` |

Nothing in this file says a workflow, intent, escalation path or action was configured, tested or published in eGain: none was observable.

## 1. Publication record

| Field | Value |
|---|---|
| eGain account / tenant name | `BLOCKED — no eGain tenant access in this environment` |
| Agent name | `BLOCKED — no eGain tenant access in this environment` |
| Published URL | `[NOT PUBLISHED — owner to add after publishing]` |
| Date and time published (Africa/Lagos) | `BLOCKED — no eGain tenant access in this environment` |
| Time the link was first opened after publishing (must be at least 5 minutes later) | `BLOCKED — no eGain tenant access in this environment` |
| Opened in a private window without an eGain session? | `[ ]` yes  `[ ]` no |
| Opened on a second device / network? | `[ ]` yes  `[ ]` no |
| Person who tested | `BLOCKED — no eGain tenant access in this environment` |
| Orylo build / deploy identifier used | `BLOCKED — no eGain tenant access in this environment` |
| Orylo synthetic data reset before testing? | `[ ]` yes  `[ ]` no |

## 2. Solution requirements (from the rules page)

| # | Requirement | Configured in eGain | Tested in Test AI Agent | Tested on published link | Evidence |
|---|---|---|---|---|---|
| 01 | Knowledge-based AI Agent trained on authorized content | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | |
| 01b | Generated intents reviewed, answer accuracy tested | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | |
| 02 | Personalized and published, working shareable link | `[ ]` BLOCKED — no eGain tenant access in this environment | n/a | `[ ]` BLOCKED — no eGain tenant access in this environment | |
| 03 | Pre-chat workflow | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | |
| 04 | Escalation workflow with at least two options | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | |
| 05 | Process workflow connected to an intent (I-02) | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | |
| 06 | Action enabled and added to the AI Agent | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | |
| 07 | Validation in Test AI Agent and via published link | n/a | `[ ]` BLOCKED — no eGain tenant access in this environment | `[ ]` BLOCKED — no eGain tenant access in this environment | |

## 3. Action tier decided

| Tier (see `action-contracts/README.md`) | Chosen? | Date decided | Reason |
|---|---|---|---|
| A: outbound call with a secret works | `[ ]` | | |
| B: notify-only | `[ ]` | | |
| C: no outbound calls | `[ ]` | | |

## 4. Scenario results

Copy the result from `test-scripts.md`. Do not enter PASS unless you ran it.

| Scenario | TAI result | TAI evidence | PUB result | PUB evidence |
|---|---|---|---|---|
| T1 Authorized policy answer | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T2 Unsupported question | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T3 Contradictory / ambiguous | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T4 Missing information | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T5 Failed step (5a, 5b) | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T6 Repeated complaint | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T7 Unauthorized action | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T8 Authorized action | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T9 Duplicate action | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T10 Human escalation (callback, email, mid-consent) | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T11 Approval path | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T12 Already cancelled | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T13 No earlier request | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T14 Customer declines | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T15 Refund promise request | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T16 Legal advice | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T17 Override and injection | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T18 Stale or expired state | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T19 Sensitive data | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |
| T20 Pre-chat handoff | NOT RUN — BLOCKED | | NOT RUN — BLOCKED | |

## 5. Differences between Test AI Agent and the published link

| Observation | Date | Resolved? |
|---|---|---|
| | | |

## 6. Defects and limitations found

| # | Description | Scenario | Severity | Fix or accepted limitation | Retested after republish (+5 min)? |
|---|---|---|---|---|---|
| | | | | | |

## 7. Statements the submission may make

Tick only what this log supports. Each unticked box means the submission must not say it.

- `[ ]` The agent is trained on authorized content only. (needs rows 01, 01b)
- `[ ]` The agent is published with a working shareable link. (needs row 02)
- `[ ]` The pre-chat workflow works. (needs row 03, T4, T20)
- `[ ]` The escalation workflow offers two options. (needs row 04, T10)
- `[ ]` The process workflow is connected to an intent and works. (needs row 05, T8, T11, T12, T13, T14)
- `[ ]` The agent takes a real action through the Orylo backend. (needs row 06, T8, T9, and Tier A)
- `[ ]` All required workflows were published and tested. (needs everything above)

Sign-off: `BLOCKED — no eGain tenant access in this environment`
