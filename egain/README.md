# eGain AI Agent Hackathon: commissioning package

Entry: **Failed Cancellation & Billing Recovery** assistant for a fictional provider, "Northfield Digital". The customer-facing agent is an **eGain AI Agent**. Orylo is the independent backend that the eGain agent calls through an HTTP Action. This repository contains the preparation. Nothing has been configured, published or tested on eGain.

## Honest status

This session had no eGain credentials, tenant or browser. Everything marked BLOCKED below is waiting for the owner to work inside the eGain UI.

| Element | Prepared in repo | Configured in eGain | Tested in eGain |
|---|---|---|---|
| Knowledge base (12 policy documents) | Yes: `knowledge/`, byte-identical to `src/policy/pack.ts` | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| Intents (15 in scope, 8 decline or escalate) | Yes: `intents.md` | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| Pre-chat workflow | Yes: `prechat.md` | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| Process workflow bound to an intent (I-02) | Yes: `workflows/failed-cancellation-guided-flow.md` | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| Escalation workflow, two options | Yes: `escalation.md` | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| Action (HTTP calls to Orylo) | Contract only: `action-contracts/openapi.yaml`; trial support `UNVERIFIED in trial` | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| Branding and publication (shareable link) | Guide only: `configuration-guide.md` | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| Validation in Test AI Agent and on the published link | Scripts only: `test-scripts.md` | n/a | `BLOCKED — no eGain tenant access in this environment` |
| Published URL | none | `BLOCKED — no eGain tenant access in this environment` | `BLOCKED — no eGain tenant access in this environment` |
| One-minute video | Script only: `../docs/hackathon/demo-script-60s.md` | n/a | `BLOCKED — no eGain tenant access in this environment` |
| Submission | Draft description and checklist: `../docs/hackathon/` | n/a | n/a (Owner action) |
| Orylo Action API implementation | Implemented in `src/app/api/v1/**`; contract-tested locally by `tests/e2e/egain-api.spec.ts` (Playwright, 12 tests, local server only); **not deployed to any public URL** — eGain cannot reach it until the owner hosts it | n/a | Local contract tests only; no call from eGain has ever been made |

## Index

| File | What it is |
|---|---|
| `knowledge/` | One Markdown file per policy document, plus `knowledge/README.md` (provenance and manifest; do not upload the README) |
| `intents.md` | Reviewed intent list with training phrases, mapped documents and expected behaviour, including decline intents |
| `prechat.md` | Pre-chat form fields, validation, how values reach the agent, what is not collected |
| `workflows/failed-cancellation-guided-flow.md` | Step-by-step guided workflow with every branch and the exact customer wording |
| `escalation.md` | The two escalation options, when each is offered, context passed, mapping to the API |
| `action-contracts/openapi.yaml` | OpenAPI 3.1 contract for the five endpoints |
| `action-contracts/README.md` | How to register the Action if the trial supports it, and the fallback tiers |
| `configuration-guide.md` | Ordered configuration and publication steps, each with an evidence tag |
| `entitlement-audit.md` | Capability by capability: what public documentation says, what the owner must check |
| `test-scripts.md` | Manual scripts for Test AI Agent and the published link; results are all `NOT RUN — BLOCKED` |
| `published-agent-acceptance-log.md` | Empty acceptance template |
| `../docs/hackathon/submission-checklist.md` | The official checklist with status and the deadline discrepancy |
| `../docs/hackathon/submission-description.md` | 139-word draft (102-word fallback) with a link placeholder |
| `../docs/hackathon/demo-script-60s.md` | Sixty-second script, shot list and the rule not to record anything untrue |
| `../docs/hackathon/judging-criteria-map.md` | Six criteria mapped to the entry, the evidence still needed and the risks |

## How the pieces fit

```
Customer
   |  pre-chat form (fullName, email, accountNumber, issueCategory, issueSummary, consent)
   v
eGain AI Agent  <-- knowledge/ (12 policy documents; answers only from these)
   |  intent I-02 "my cancellation failed and I was charged again"
   v
eGain process workflow (guided flow)
   |  HTTPS + Bearer key (egain:actions) + X-Customer-Token        <-- Action, UNVERIFIED in trial
   v
Orylo (independent backend)
   - verifies two identity factors, opens or resumes the case, diagnoses
   - proposes only permitted actions with exact consent text
   - executes after consent, idempotently, then reads the result back
   - issues receipts; records escalations
```

Rules that run through every file:

- The customer-facing agent runs on eGain. No custom chatbot replaces it.
- Orylo enforces policy from the same pack that the agent quotes (`src/policy/pack.ts`), so the two cannot disagree.
- "Verified" is said only when the API returns `verification.verified = true`. A billing review is reported as "Review opened — no money has moved." Refunds are never promised or described as done. No endpoint moves money.
- Only synthetic data and demonstration contact details are used (+1 (555) 010-0100, support@demo.orylo.example).
- Public eGain documentation is cited with its URL. Where nothing public was found, the files say `Not found in public docs` or `UNVERIFIED in trial`.

## What the owner must do, in order

1. Create or open the eGain account (trial) now; participation is first come, first served. See `configuration-guide.md`, Step 1.
2. Read the hands-on lab and correct `configuration-guide.md` where the real UI differs (Step 2). Record findings in `entitlement-audit.md`.
3. Create the agent; upload the Core files from `knowledge/` (Steps 3 and 4).
4. Review intents and add the training phrases from `intents.md` (Step 5). Run test scripts T1 to T3 in Test AI Agent (Step 6).
5. Build the pre-chat workflow, then the escalation workflow with both options (Steps 7 and 8).
6. Build the process workflow and bind it to I-02 (Step 9). Make the informational path work first.
7. Attempt the Action (Step 10). **Decide Tier A, B or C by 2026-11-11** and update the description and video plan to match.
8. Coordinate with the Orylo engineer: deployed HTTPS host, `egain:actions` key, a reset for the four synthetic identities, confirmation of the error-code HTTP mapping.
9. Brand the agent, run every script in Test AI Agent, publish, **wait up to five minutes**, then run every script on the published link (Steps 11 to 14). Fill `published-agent-acceptance-log.md` as you go.
10. Record the video only after the agent is published and tested, following the "do not record unless true" rule (Step 15).
11. Choose description Version A or B, add the real link, tick only what the acceptance log supports, and submit by **2026-11-12 23:30 Africa/Lagos**. The official deadline is November 15, 11:59 PM PST, but a possible earlier date is unresolved; see `../docs/hackathon/submission-checklist.md`.

## Open questions for the owner

- Which deadline applies (official page versus an earlier Devpost listing)? Unresolved.
- Does the trial allow an outbound HTTP call from a workflow? Not found in public docs.
- Does the trial give a hosted shareable link, and can judges be given reviewer access? `UNVERIFIED in trial`.
- Did Orylo exist before the hackathon period (for the disclosure line in the form)?

## Notes on provenance

- The policy documents in `knowledge/` were produced by evaluating `src/policy/pack.ts` and writing each `body` string unchanged. The extraction script was a throwaway outside the repository. `npm run egain:export` is mentioned in the header of `pack.ts` as the maintained route; if it exists, use it and diff.
- The brief described eleven policy documents; `pack.ts` has twelve. All twelve are included.
- The eGain help site renders client-side, so release notes could only be read as search excerpts. The hands-on lab showed only its overview. Both limits are stated wherever the sources are used.
