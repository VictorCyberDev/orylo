# Organizer submission readiness — as of 2026-11-11

Official page: https://www.egain.com/ai-agent-hackathon/ · form: https://www.egain.com/ai-agent-hackathon-project-submission/ · **deadline: November 15, 11:59 PM PST**.
Status words: VERIFIED / PARTIAL / BLOCKED / UNVERIFIED / NOT DONE. Nothing here may be ticked on the form until it reads VERIFIED.

| # | Required by the rules | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | Participant/team information | NOT DONE | Owner action |
| 2 | Agent name, industry, use case | VERIFIED (prepared) | "Orylo" is the live agent's name in eGain; use case: failed cancellation and billing recovery (subscription services) |
| 3 | **Working demo link** | **BLOCKED** | No public URL: Neon and Supabase free plans are full (`docs/operations/vercel-deployment.md`). Owner picks one of three free-slot options, then deploy is ~10 minutes |
| 4 | 150-word description | PARTIAL | Draft in `submission-description.md`; its claims about knowledge/actions must stay out until verified |
| 5 | One-minute video (content-based answer + a workflow + distinctive feature) | **BLOCKED** | Cannot be recorded truthfully: the agent does not yet answer policy questions (0/11) and no workflow is observable |
| 6 | Confirmation all required workflows were published and tested | **NOT TRUE YET** | Pre-chat, process workflow, two escalation options: not observable in the public agent (K10 returned a generic "contact customer care") |
| 7 | Knowledge-based agent trained on authorized content | **FAILED** (today) | `docs/evidence/egain-live-tests.md`; fix: `egain/knowledge-fix.md` + `egain/upload-pack/` |
| 8 | Published experience | PARTIAL | The anonymous embed works; "published" for the current configuration UNVERIFIED |
| 9 | Escalation ≥ 2 options | UNVERIFIED | Orylo's endpoints exist and are tested locally; eGain-side options not observed |
| 10 | Action (agent changes something real) | BLOCKED | Needs a public Orylo URL **and** eGain's ability to call an external API (UNVERIFIED) |
| 11 | Disclosure of pre-existing/AI-generated work | VERIFIED (prepared) | `submission-description.md`: created during the hackathon with AI coding assistance; open-source libraries |
| 12 | Fictional data only; no personal data | VERIFIED | Synthetic data throughout; reviewer access by code, no public password |
| 13 | Be able to explain and demonstrate | PARTIAL | Demonstrable locally and on a deployed `/demo` once it exists |

**Shortest honest path to a submittable entry (owner, in order):** (1) free one database slot → deploy (`vercel-deployment.md`); (2) fix the agent's knowledge (`knowledge-fix.md`) and re-run `npm run test:live` until the 13 cases pass; (3) configure the two escalation options and the guided workflow per `egain/` guides; (4) record the video from what then works; (5) update Devpost (`devpost-update.md`); (6) submit before the deadline.
If only (1) and (2) are achievable in time, say so in the entry and do not claim workflows or actions.
