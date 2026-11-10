# Configuration and publication guide (for the owner, inside eGain)

Status: **Prepared in repo.** Nothing in this guide has been performed. This session had no eGain tenant, credentials or browser. Every step is `BLOCKED — no eGain tenant access in this environment` until the owner does it.

No eGain trial screen was seen while writing this. Click-level paths for the product UI are therefore not known, and this guide does **not** invent menu names. Where public documentation names a step or feature, the step is tagged with its URL. Where it does not, the step says what to achieve and is tagged `UNVERIFIED — confirm in the trial UI`. Record what you actually see in `published-agent-acceptance-log.md` as you go.

Evidence tags used:

- **Documented publicly (URL)**: the URL states the fact. Pages under `ebrain.egain.com` render client-side and could not be fetched as full pages; for those, the tag says "excerpt".
- **Not found in public docs**: searched, nothing found.
- **UNVERIFIED — confirm in the trial UI**: unknown until you look.

Internal target: submit by **2026-11-12 23:30 Africa/Lagos** (14:30 PST on 2026-11-12). Official deadline on the rules page: **November 15, 11:59 PM PST** (= 2026-11-16 08:59 Africa/Lagos). See `../docs/hackathon/submission-checklist.md` for the unresolved date discrepancy. Treat the internal target as the real one.

## Order of work

### Step 1. Create or open the eGain account
Goal: a working account that can create an AI Agent.
- The rules say to use an existing eGain account or create a trial account with a working email address. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).**
- The self-service page offers "Sign up for a free trial" and says the AI Agent can be tried for no charge for the first two weeks. **Documented publicly (https://www.egain.com/ai-agent-customer-self-service/).** Two sources found by a search tool disagree on trial length (two weeks versus 30 days for a different product, Composer); confirm at sign-up.
- Note the hackathon page says participation is limited and first come, first served. Do this first.
- Use an email you control. Do not use real customer data anywhere in the tenant.
- Join the Discord linked on the rules page if you need platform answers. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).**

### Step 2. Open the hands-on lab alongside
Goal: follow eGain's own walkthrough for UI paths this guide cannot give.
- The lab link is on the rules page. Its overview says it covers "account setup and document-based training" through "specialized pre-chat, escalation, and process tool workflows" and ends with publishing and sharing an agent. **Documented publicly (https://share.articulate.com/daJ5S2RJxBQWPP_ijlVud).** The lesson content could not be read from this environment (the page showed a sign-in form). Read it yourself and correct this guide where it differs.
- The rules page also mentions an "eGain Workflow Library" for examples. **Documented publicly (https://www.egain.com/ai-agent-hackathon/)**, but no URL for it appears on that page. Ask in Discord or at psai@egain.com (the contact the rules page gives for product questions) if you cannot find it.

### Step 3. Create the AI Agent
Goal: an agent named for this entry, for example "Northfield Billing Recovery Assistant" (industry: subscription services / utilities; use case: failed cancellation and billing recovery).
- Self-service flow is described as: point to trusted content, test, personalize and publish, connect to systems. **Documented publicly (https://www.egain.com/ai-agent-customer-self-service/).**
- The exact screens and the name of the "create agent" action: **UNVERIFIED — confirm in the trial UI.**

### Step 4. Add the knowledge
Goal: the agent answers only from the twelve documents in `knowledge/`.
- Content sources named publicly: "Docs (PDF, Word, HTML)", websites, and the eGain Knowledge Portal. **Documented publicly (https://www.egain.com/ai-agent-customer-self-service/).**
- Upload the files listed as Core in `knowledge/README.md` (and the two optional files only if you want broader content). Do not upload `knowledge/README.md`.
- Whether `.md` files are accepted: **UNVERIFIED — confirm in the trial UI.** If not, convert to HTML, Word or PDF without changing wording and recheck the text.
- Match the agent's language to the source: do not paraphrase the policies in agent instructions. **Documented publicly as a requirement (https://www.egain.com/ai-agent-hackathon/).**
- Wait for training or indexing to finish. How the trial shows progress: **UNVERIFIED — confirm in the trial UI.**

### Step 5. Review generated intents
Goal: the intent list matches `intents.md`.
- The rules ask entrants to review generated intents and test answer accuracy. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).** The self-service page calls this "Confirm topics". **Documented publicly (https://www.egain.com/ai-agent-customer-self-service/).**
- Rename, merge or add intents so that I-01 to I-13 exist (I-14 and I-15 if the optional files were uploaded), and add the training phrases. Whether intents are editable and whether decline-type intents (U-01 to U-08) can be defined: **UNVERIFIED — confirm in the trial UI.**
- If decline-type intents cannot be defined, put the behaviours from `intents.md` into the agent's instructions or persona field, if one exists, and record the limitation.

### Step 6. Test answers in Test AI Agent
Goal: the content-based answer works before any workflow is built.
- The page names "Test AI Agent". **Documented publicly (https://www.egain.com/ai-agent-hackathon/; https://www.egain.com/ai-agent-customer-self-service/).**
- Run scenario T1, T2 and T3 from `test-scripts.md`. Fix problems by editing instructions or intents, never by adding policy text that is not in `knowledge/`.

### Step 7. Build the pre-chat workflow
Goal: the form in `prechat.md`.
- Existence of pre-chat workflows and shared session variables used "by exact name": **Documented publicly, excerpt (https://ebrain.egain.com/kb/updates/content/EASY-19122/Enhancements-21236).**
- Field creation, validation and the consent checkbox: **UNVERIFIED — confirm in the trial UI.**
- Use the exact variable names from `prechat.md`.

### Step 8. Build the escalation workflow
Goal: the two options in `escalation.md`, working with no Action.
- Existence: **Documented publicly, excerpt (https://ebrain.egain.com/kb/updates/content/EASY-17875/Enhancements-21232).**
- The rules require at least two options and demonstration contact details. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).** The self-service page lists escalation to SMS, email or phone. **Documented publicly (https://www.egain.com/ai-agent-customer-self-service/).**
- Create callback request (+1 (555) 010-0100) and email follow-up (support@demo.orylo.example). Do **not** set up live chat; it needs Conversation Hub queues and a chat entry point URL. **Documented publicly, excerpt (https://ebrain.egain.com/kb/updates/content/EASY-16410/Enhancements-2122).**
- Triggering from the agent, and passing session variables into the form: **UNVERIFIED — confirm in the trial UI.**

### Step 9. Build the process workflow and bind it to intent I-02
Goal: the guided flow in `workflows/failed-cancellation-guided-flow.md`.
- A workflow can be added to the AI Agent as a tool, with a tool description and chosen input variables. **Documented publicly, excerpt (https://ebrain.egain.com/kb/updates/content/EASY-18868/Enhancements-21235).**
- The rules require the process workflow to be connected to an appropriate intent. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).**
- Build the informational path first (consent, status wording, branches, handoff) so the workflow works even if no Action is available. Then attempt Step 10.
- Step types available (message, choice buttons, conditions, variables): **UNVERIFIED — confirm in the trial UI.**

### Step 10. Attempt to add the Action
Goal: the workflow calls the five endpoints (1 to 4 in the flow; 5 is for the owner).
- Public documentation of an outbound HTTP or API step in AI Agent workflows: **Not found in public docs.**
- Follow `action-contracts/README.md`. Record in `entitlement-audit.md` exactly which step types you found.
- **Decision point (by 2026-11-11 if possible):** Tier A, B or C as defined in `action-contracts/README.md`. Update `../docs/hackathon/submission-description.md` (delete the marked sentences if Tier B or C) and `../docs/hackathon/demo-script-60s.md` (record only what is true).
- The Orylo side must be deployed, reachable over HTTPS, and reset to known synthetic state before this step can be tested. That is the Orylo engineer's deliverable and is not assessed here.

### Step 11. Personalize the agent
Goal: a clear branded experience (name, greeting, colours) with meaningful customization beyond the tutorial.
- "Brand your agent" is named publicly. **Documented publicly (https://www.egain.com/ai-agent-customer-self-service/).**
- Include the demonstration notice and the sample identity text from `prechat.md`.
- Visual customization alone is not enough, per the rules. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).**

### Step 12. Validate in Test AI Agent
Goal: all workflow paths pass before publishing.
- Run every scenario in `test-scripts.md` in "Test AI Agent" and record results.
- The rules require validation in Test AI Agent and through the published link. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).**

### Step 13. Publish and wait
Goal: a shareable link that works for someone who is not signed in.
- Publishing and a "working shareable demo link" are required. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).**
- The self-service page describes embedding the agent on a website. **Documented publicly (https://www.egain.com/ai-agent-customer-self-service/).** Whether the trial gives a hosted shareable link without embedding: **UNVERIFIED — confirm in the trial UI.** The rules require such a link.
- **Allow up to five minutes after publishing for changes to appear.** **Documented publicly (https://www.egain.com/ai-agent-hackathon/).** Republishing after any fix needs the same wait.
- Open the link in a private window with no eGain session. Record the exact URL in the acceptance log. Never record a URL there that you did not open.

### Step 14. Validate on the published link
Goal: the same scenarios behave the same way outside the builder.
- Run `test-scripts.md` again against the published link. Fill in `published-agent-acceptance-log.md`.
- Anything that passes in "Test AI Agent" and fails on the link is a failure of the entry. Fix, republish, wait five minutes, rerun.

### Step 15. Record and submit
- Record the video following `../docs/hackathon/demo-script-60s.md`, including its "do not record unless true" rule.
- Fill `../docs/hackathon/submission-checklist.md`. Finalise `../docs/hackathon/submission-description.md` with the real link and the true sentences only.
- Submit at https://www.egain.com/ai-agent-hackathon-project-submission/ (**Documented publicly**, linked from https://www.egain.com/ai-agent-hackathon/). Submit once; keep a copy of the confirmation.
- The organizers may request temporary reviewer access or a short live demonstration. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).** How to grant reviewer access in a trial tenant: **UNVERIFIED — confirm in the trial UI.**

## If something blocks you

- Platform terms and community rules apply. Follow them. **Documented publicly (https://www.egain.com/ai-agent-hackathon/).**
- Questions about the rules or product: Discord, or psai@egain.com (both from the rules page).
- Do not work around a missing capability by pointing the customer to a non-eGain chatbot. The customer-facing agent must be the eGain AI Agent.
