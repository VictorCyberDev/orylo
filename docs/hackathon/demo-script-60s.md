# One-minute demonstration video: script and shot list

The rules require a one-minute video showing a content-based answer, at least one workflow, and the solution's most valuable or distinctive feature. Judges "prioritize clarity, authenticity, and storytelling over editing quality" (https://www.egain.com/ai-agent-hackathon/).

> **2026-11-11 gate:** a live test of the owner's published agent shows it does not yet answer the Northfield policies (0 of 11) and no workflow or action is observable. Do **not** record or submit anything that depends on them until `npm run test:live` passes the knowledge cases. See `organizer-readiness-checklist.md`.

Status: **Prepared as a script.** Nothing has been recorded. The footage can only be recorded after the eGain agent is published and tested, and some blocks depend on the Action: `BLOCKED — no eGain tenant access in this environment`.

## Rule that overrides everything: do not record unless true

1. Record only what the real published eGain agent did on screen, in one continuous take per block. No mock-ups, no re-created screens, no voice-over describing an action that is not visible, no cuts that hide a failure or a wait.
2. The timing below is a target. If the real flow takes longer than the block, speed up the footage visibly (a clock or "2x" label) or choose a shorter test identity; do not trim out a step.
3. If the Action is not working in eGain (Tier B or C), do not record blocks 18 to 53. Use the alternate script at the end of this file, and say plainly in narration that account changes are not performed from eGain in this entry.
4. If Orylo's console is shown, caption it "Orylo (separate system)". Never composite or edit it into the eGain footage as if it were part of the agent.
5. Show a receipt number only if the API returned one. Never invent or retype one.
6. Reset the synthetic identity first (open dependency for the Orylo engineer) so the take shows the true starting state.
7. Do not say or show "refunded". Say "review opened, no money has moved".
8. Use only synthetic data. No real names, accounts, emails or cards, and nothing from a personal inbox on screen.
9. If a block fails on the take, record it again. Do not fix it in the edit.

## Target script (Tier A: Action works)

Identity: Jordan Reyes, jordan.reyes@customer.example, NF-100234. Running time 60 seconds. Narration is about 113 words, at a calm pace (under 2.5 words per second in every block).

| Time | On screen (what must really happen) | Narration |
|---|---|---|
| 00–08 | Published agent link in a clean browser window. Pre-chat form filled as Jordan; helper text "demonstration" visible. Customer types: "I cancelled last week and you charged me again." | "Jordan cancelled nine days ago. It was never applied, and a new charge arrived." |
| 08–18 | Agent recognises the situation, quotes the policy in its own words from the knowledge base (30-day correction window, customer confirms, cancelling does not refund past charges), then shows findings from the account check: earlier request found, account still active, $29.99 charge. | "The eGain AI Agent finds the intent, retrieves our written policy, and checks the account." |
| 18–30 | Agent shows the exact consent text for step one. Customer clicks the confirmation control. | "It knows what it is allowed to do, and nothing else. It asks for explicit consent for each step, using the exact wording." |
| 30–43 | Action executes. Agent shows "Verified" with the receipt number, then asks consent for the billing review and shows "Review opened — no money has moved." with a receipt. | "Then it acts. Orylo, an independent backend, applies the cancellation. The agent reports it as done only when the result is read back and verified." |
| 43–53 | Agent shows the partial-resolution message: cancellation verified, review open, billing team decides, no refund promised. | "Cancellation is confirmed. The charge is under billing review, and the agent says the billing team decides. It never promises a refund." |
| 53–60 | Cut to the outcome record (Orylo, captioned as a separate system) showing the ledger, or the receipt check. Back to the agent offering "callback request" and "email follow-up". Title card: agent name, "eGain AI Agent + Orylo", "all data synthetic". | "Every step is recorded, and a person is one click away. Built on eGain." |

Required elements check (rules): content-based answer = 08–18; workflow = 18–53; most distinctive feature = consented, verified action with an honest partial result = 30–53.

Word budget: aim for 110 to 120 words total across blocks. Read the narration aloud once with a timer before recording.

## Shot list

| # | Shot | Source | Notes |
|---|---|---|---|
| 1 | Pre-chat form and first message | Published link, private window | Show the URL bar so the link is visible |
| 2 | Policy answer | Published link | Highlight nothing; do not edit the text |
| 3 | Findings message | Published link | Check the figures against Orylo before recording |
| 4 | Consent text, first step | Published link | The text must be the API's `consentText` |
| 5 | Confirmation click | Published link | |
| 6 | "Verified" with receipt | Published link | |
| 7 | Consent and result for billing review | Published link | "Review opened — no money has moved." |
| 8 | Partial-resolution message | Published link | |
| 9 | Orylo ledger / receipt check | Orylo admin view or receipt endpoint, captioned "Orylo (separate system)" | Optional; skip if it would take more than 5 seconds |
| 10 | Escalation options | Published link | Both options with demonstration details |
| 11 | Title card | Editor | Plain text |

## What to capture beyond the video (for the acceptance log)

- The published URL, the time it was published, and the time the take was recorded (at least five minutes after publishing).
- The receipt number(s) shown, and a check of each with `GET /api/v1/receipts/{receiptNo}/verify`.
- A screenshot of the Orylo ledger for the case, kept outside the repository.
- The Orylo build identifier in use.
- Any retake and why.

## Practical notes

- Recording: use the screen recorder you already have. Typing speed should be natural.
- Captions: add short on-screen captions for the pre-chat helper text and "all data synthetic". Do not add captions that claim more than the footage shows.
- Audio: a plain voice-over is enough.
- File: upload as the form requires; keep the original and a note of the exact take.

## Alternate script (Tier B or C: no Action in eGain)

Use only if `egain/action-contracts/README.md` Tier B or C applies. Narration must say what is not done.

| Time | On screen | Narration |
|---|---|---|
| 00–10 | Pre-chat form; customer: "I cancelled last week and you charged me again." | "A customer cancelled and was charged again. Here is how the eGain AI Agent starts." |
| 10–25 | Policy answer grounded in the knowledge base, with the refund rule. | "It answers from the written policy and never promises a refund." |
| 25–45 | Guided workflow: explains what could be done under policy (correction within 30 days, billing review within 60 days, approval over $50.00), states it cannot check or change the account from here. | "It guides the customer through the process. In this entry, account changes are not performed from eGain, so it says so." |
| 45–55 | Declines a refund promise request; offers the two escalation options. | "When a request is risky or outside its limits, it declines and offers a person." |
| 55–60 | Both options with demonstration contact details; title card. | "A callback or an email follow-up, with the full context passed on." |
