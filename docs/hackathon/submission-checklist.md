# Submission checklist

Mirrors the official rules page (https://www.egain.com/ai-agent-hackathon/, retrieved 2026-11-10; page last modified 2026-11-09 per its metadata). Status values: **Prepared** (files exist in this repository), **BLOCKED** (needs the eGain tenant, which this session did not have), **Owner action** (a person must do it).

For anything on eGain's platform the BLOCKED status is exactly: `BLOCKED — no eGain tenant access in this environment`.

## Deadline

| Source | Date |
|---|---|
| Official rules page | "November 15, 11:59 PM PST" (= 2026-11-16 08:59 Africa/Lagos). The page's countdown timer, read at retrieval on 2026-11-10, was consistent with that moment. |
| An earlier Devpost listing | Reportedly showed an earlier date. **Unresolved.** A web search on 2026-11-10 did not find a Devpost listing for this event, so the claim could not be checked. |
| Internal target | **2026-11-12 23:30 Africa/Lagos** (14:30 PST, 2026-11-12) |

Actions on the discrepancy (Owner action): ask in the hackathon Discord or at psai@egain.com which date applies, check the registered email for notices (the rules say material changes are communicated to registered participants), and keep the internal target regardless. Do not rely on the later date.

## Eligibility (Owner action)

| Item | Status |
|---|---|
| Entering individually or as a team of up to 3; each person in only one submission | Owner action |
| Working email for the eGain account | Owner action |
| Participant or team information ready | Owner action |

## Official submission checklist

| # | Official item | Status | Where it is prepared |
|---|---|---|---|
| 1 | Agent is trained, tested, and published | `BLOCKED — no eGain tenant access in this environment` | `egain/configuration-guide.md`, `egain/test-scripts.md`, `egain/published-agent-acceptance-log.md` |
| 2 | Source content is authorized and contains no sensitive data | Prepared (twelve synthetic documents, byte-for-byte from `src/policy/pack.ts`) | `egain/knowledge/` |
| 3 | Answers are grounded in the source content | `BLOCKED — no eGain tenant access in this environment` (scripts prepared) | `egain/test-scripts.md` T1 to T3 |
| 4 | Pre-chat, escalation, and process workflows work | `BLOCKED — no eGain tenant access in this environment` (designs prepared) | `egain/prechat.md`, `egain/escalation.md`, `egain/workflows/failed-cancellation-guided-flow.md` |
| 5 | Process workflow is connected to an intent | `BLOCKED — no eGain tenant access in this environment` (intent I-02 defined) | `egain/intents.md` |
| 6 | Demo link works | `BLOCKED — no eGain tenant access in this environment` | `egain/published-agent-acceptance-log.md`, section 1 |
| 7 | Description and one-minute video are complete | Description: Prepared (draft, 139 words, with a 102-word fallback). Video: script prepared, not recorded (Owner action once the agent is published) | `docs/hackathon/submission-description.md`, `docs/hackathon/demo-script-60s.md` |
| 8 | Entry is submitted before the deadline | Owner action (internal target 2026-11-12 23:30 Africa/Lagos) | https://www.egain.com/ai-agent-hackathon-project-submission/ |

## Solution requirements

| # | Requirement | Status |
|---|---|---|
| 01 | Knowledge-based AI Agent; generated intents reviewed; answer accuracy tested | Prepared in repo. `BLOCKED — no eGain tenant access in this environment` for configuration and testing |
| 02 | Personalized and published, with a working shareable demo link | `BLOCKED — no eGain tenant access in this environment` |
| 03 | Pre-chat workflow | Prepared in repo. `BLOCKED — no eGain tenant access in this environment` for configuration and testing |
| 04 | Escalation workflow with at least two options (demonstration details) | Prepared in repo (callback request, email follow-up). `BLOCKED — no eGain tenant access in this environment` for configuration and testing |
| 05 | Process workflow connected to an appropriate intent | Prepared in repo. `BLOCKED — no eGain tenant access in this environment` for configuration and testing |
| 06 | Actions: agent takes a real action; actions enabled and added to the AI Agent | Contract prepared (`egain/action-contracts/openapi.yaml`). Trial support `UNVERIFIED in trial`. `BLOCKED — no eGain tenant access in this environment` for configuration and testing. Orylo-side implementation is by the other engineer and is not assessed here |
| 07 | Validation in Test AI Agent and via the published link (allow up to five minutes after publishing) | `BLOCKED — no eGain tenant access in this environment` |

## Submission form contents

| Item | Status | Notes |
|---|---|---|
| Participant or team information | Owner action | |
| Agent name, industry, use case | Prepared (suggested: "Northfield Billing Recovery Assistant"; subscription services; failed cancellation and billing recovery) | Owner may rename |
| Working demo link | `BLOCKED — no eGain tenant access in this environment` | Placeholder in `submission-description.md`: `[LIVE LINK — owner to add after publishing]` |
| Description, up to 150 words | Prepared (139 words full; 102 words fallback) | Choose the version that is true; see sentence table |
| One-minute video: content-based answer, at least one workflow, most distinctive feature | Script prepared, not recorded. Recording is `BLOCKED — no eGain tenant access in this environment` | "Do not record unless true" rule applies |
| Confirmation that all required workflows were published and tested | `BLOCKED — no eGain tenant access in this environment` | Tick only what `egain/published-agent-acceptance-log.md` section 7 supports |
| Disclosure of material pre-existing templates, code, or third-party assets | Owner action | Orylo is pre-existing or independent code; describe it accurately (suggested text in `submission-description.md`). Also disclose any template taken from the hands-on lab or Workflow Library |

## Content and conduct

| Rule | Status |
|---|---|
| Only content owned, authorized or supplied | Prepared: policy pack is self-authored |
| No confidential information, personal data, passwords, account numbers or real customer records | Prepared in design. The account numbers (`NF-xxxxxx`), emails (`@customer.example`) and phone and email contacts are fictional demonstration values. Owner action: confirm nothing real is entered during recording |
| Fictional test data and demonstration contact details | Prepared: +1 (555) 010-0100, support@demo.orylo.example |
| Be able to explain and demonstrate the solution | Owner action: prepare for a possible request for temporary reviewer access or a short live demonstration |
| Follow eGain platform terms and community guidelines | Owner action |

## Dependencies and open items

| Item | Owner | Status |
|---|---|---|
| Orylo implements the HTTP action API exactly as in `egain/action-contracts/openapi.yaml`, deployed on an HTTPS host reachable from eGain | Orylo engineer | Not assessed here |
| A way to reset the four synthetic identities (Jordan, Priya, Marcus, Elena) before recording and before reviewers test | Orylo engineer | Not provided in this package. Without it a second run shows "already cancelled" |
| HTTP status mapping for error codes confirmed | Orylo engineer | Proposed in the YAML only |
| Decision on Action tier A, B or C | Owner | Owner action, target 2026-11-11 |
| Reviewer instructions: how a judge can try the agent with the synthetic identities | Owner | Owner action (helper text in `egain/prechat.md`) |
| Re-export `egain/knowledge/` with `npm run egain:export` once it exists, and diff | Orylo engineer | Open |
