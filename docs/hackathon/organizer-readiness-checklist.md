# Organizer submission readiness — as of 2026-11-11

Official page: https://www.egain.com/ai-agent-hackathon/ · form: https://www.egain.com/ai-agent-hackathon-project-submission/ · **deadline: organizer rules say Nov 15 11:59 PM PST (= Nov 16 08:59 WAT); Devpost reportedly closes Nov 13 2026 05:30 WAT. Use the earliest: Nov 13 2026 05:30 WAT**.
Status words: VERIFIED / PARTIAL / BLOCKED / UNVERIFIED / NOT DONE. Nothing here may be ticked on the form until it reads VERIFIED.

| # | Required by the rules | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | Participant/team information | NOT DONE | Owner action |
| 2 | Agent name, industry, use case | VERIFIED (prepared) | Agent name "Orylo"; use case: failed cancellation and billing recovery (subscription services) |
| 3 | **Working demo link** | **VERIFIED** (site) / see 8 | https://orylo-demo.vercel.app and /demo are public (HTTP 200, health ok, no exposed credentials). Evidence: `docs/evidence/public/`, `tests/live/public.live.spec.ts` (6 of 8 pass) |
| 4 | 150-word description | PREPARED | "Version C" in `submission-description.md` (121 words) |
| 5 | One-minute video (content-based answer + a workflow + distinctive feature) | **PARTIAL** | A real 49-second recording exists (`docs/evidence/video/`): the eGain agent answering from policy with sources, then Orylo's verified correction, pending billing review, receipt check, callback request. It shows eGain and Orylo as **separate systems**. It still needs a hosted video URL (owner's account). |
| 6 | Confirmation: all required pre-chat, escalation and process workflows published and tested | **NOT TRUE** | Not observable on the published agent; W4/K10 live tests fail (generic "contact customer care") |
| 7 | Knowledge-based agent trained on authorized content, grounded answers | **PARTIAL** | 11 of 13 live cases pass with cited sources; K08 and K10 fail; the agent sometimes claims actions it did not perform (W3 FAIL) — `docs/evidence/egain-live-tests.md` |
| 8 | Published experience | PARTIAL | The agent's own public page works anonymously. The embedded widget does **not** open inside Orylo's pages on the public origin until the owner adds `https://orylo-demo.vercel.app` to the agent's allowed domains (the 2 failing public tests) |
| 9 | Escalation ≥ 2 options | **NOT DONE in eGain** | Orylo's own callback + email follow-up exist and work on its portal; eGain-side options not observed |
| 10 | Action (agent changes something real) | **BLOCKED** | No eGain-originated call has happened. Needs the owner to configure an HTTP action in eGain (capability UNVERIFIED) using the API key flow in `egain/action-contracts/README.md` |
| 11 | Disclosure of pre-existing/AI-generated work | VERIFIED (prepared) | `submission-description.md` disclosure note |
| 12 | Fictional data only; no personal data | VERIFIED | Synthetic data; reviewer access by code, no public password |
| 13 | Be able to explain and demonstrate | PARTIAL | Demonstrable on the deployed site |

**What I did not and cannot do:** submit the organizer form or update Devpost (no logins; and the form's confirmation 6 is not true). **Shortest honest path (owner, before Nov 13 05:30 WAT):** (1) in eGain, add `https://orylo-demo.vercel.app` to the agent's allowed domains; (2) add the guardrail text from `egain/knowledge-fix.md` (never state an action as done) and the escalation options; (3) if the trial allows, configure the HTTP action; (4) host the video; (5) paste `devpost-update.md`; (6) submit only what is true — if 6 stays untrue, say so in the entry.
