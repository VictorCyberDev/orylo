# Submission description (150 words maximum)

The official rules ask for "a description of up to 150 words explaining the problem, intended user, business value, and distinctive features" (https://www.egain.com/ai-agent-hackathon/).

> **2026-11-11 update:** the owner's agent now answers the Northfield policies (11 of 13 live cases pass) and Orylo is deployed publicly. The eGain agent still does **not** call Orylo, and no pre-chat/process/escalation workflow is observable. **Version C below is the only text that matches what is verified today.** Versions A and B describe things that are not true yet; do not use them unless the owner builds them in eGain and `egain/published-agent-acceptance-log.md` records the passing test.

## Version C: what is true today (121 words)

> Northfield Digital is a fictional subscription provider where customers who cancel are sometimes charged again and must repeat their story. This eGain AI Agent answers from authorized policy documents and cites its sources. Orylo, a separate backend deployed publicly, handles the correction: with the customer's explicit consent it applies the earlier cancellation, reads the account back to verify it, and issues a signed receipt anyone can check. The billing review is opened but stays pending; no refund is promised, and charges over $50.00 need a team member's approval. The customer can request a callback or email follow-up that carries the case context. Today the eGain agent does not call Orylo; the two are shown side by side. All data is synthetic.

Notes: it claims *knowledge-based answers* and a *published experience* (the agent's public page), not Actions, pre-chat, process or escalation workflows. The form's capability checkboxes should therefore tick only what the owner has observed in eGain's Test AI Agent. The form's "Publication and testing confirmation" requires **published and tested pre-chat, escalation (≥2 options) and process workflows connected to an intent: that is not true today and must not be ticked** unless the owner builds and tests them first.

**Status: DRAFT. Do not submit until the owner has checked every sentence against `egain/published-agent-acceptance-log.md`.** Sentences that describe the eGain agent calling Orylo are true only if that was built, published and tested in eGain. Nothing was built, published or tested in eGain from this repository (`BLOCKED — no eGain tenant access in this environment`).

## Version A: full (use only if the Action works on the published link: Tier A in `egain/action-contracts/README.md`)

> Northfield Digital is a fictional subscription provider where customers who cancel are sometimes billed again, then repeat the story across several contacts. This eGain AI Agent answers from authorized policy documents, collects identity details in a pre-chat form, and guides the customer through a Failed Cancellation and Billing Recovery workflow. With explicit consent it calls Orylo, an independent backend, to apply the earlier cancellation and open a billing review. It reports success only after the result is read back and verified, with a receipt. It never promises refunds: it says a review is open and no money has moved. Charges over $50.00 wait for a team member's approval. Unsupported or risky requests are declined or escalated through a callback request or email follow-up. The aim is fewer repeat contacts while money decisions stay with people. All data is synthetic.

**Word count: 139** (counted by splitting on whitespace; "$50.00" and "pre-chat" count as one word each).

Sentences, in order:

| # | Sentence (opening words) | Depends on the Action? | Words |
|---|---|---|---|
| 1 | Northfield Digital is a fictional subscription provider… | No | 22 |
| 2 | This eGain AI Agent answers from authorized policy documents… | No (needs Steps 1 to 9 of the configuration guide) | 28 |
| 3 | With explicit consent it calls Orylo… | **Yes. Delete if Tier B or C.** | 19 |
| 4 | It reports success only after the result is read back… | **Yes. Delete if Tier B or C.** | 15 |
| 5 | It never promises refunds: it says a review is open… | **Yes (a review is only "open" if the Action opened it). Replace with the fallback sentence.** | 15 |
| 6 | Charges over $50.00 wait for a team member's approval. | **Yes. Delete if Tier B or C.** | 9 |
| 7 | Unsupported or risky requests are declined or escalated… | No (needs the escalation workflow and decline behaviour tested) | 15 |
| 8 | The aim is fewer repeat contacts while money decisions stay with people. | No (a stated aim, not a claim of measured results) | 12 |
| 9 | All data is synthetic. | No | 4 |

## Version B: fallback (use if the Action is unavailable in the trial: Tier B or C)

> Northfield Digital is a fictional subscription provider where customers who cancel are sometimes billed again, then repeat the story across several contacts. This eGain AI Agent answers from authorized policy documents, collects identity details in a pre-chat form, and guides the customer through a Failed Cancellation and Billing Recovery workflow. It never promises refunds and explains that the billing team decides. Unsupported or risky requests are declined or escalated through a callback request or email follow-up. Account changes are not performed from eGain in this entry. The aim is fewer repeat contacts while money decisions stay with people. All data is synthetic.

**Word count: 102.**

In Version B, sentence 2 must still be true: the guided workflow exists and has been tested as an informational path. If the workflow could not be built either, delete "and guides the customer through a Failed Cancellation and Billing Recovery workflow" and re-count.

## Demo link

The demo link goes in the form's link field. Do not put an unverified link in the description.

`[LIVE LINK — owner to add after publishing]`

Add the link only after it has been opened in a private window, at least five minutes after publishing, and the acceptance log records it.

## Claims to avoid

- "Live", "deployed", "published", "tested" or "passed", unless the acceptance log says so.
- "Refunded", "refund approved", "money returned" in any form.
- Any measured benefit (percentages, time saved). None has been measured.
- Any eGain feature as available (MCP, A2A, Composer, Agentic Studio, connectors) unless the owner confirmed it in the trial and it is used.
- That the customer data is real, or that the customer-facing agent is anything other than the eGain AI Agent.

## Disclosure to add in the form's notes field (not counted in the description)

Facts established from the repository (2026-11-11), not from memory: the first commit is dated **2026-11-10 13:32 UTC**, the hackathon page was last modified **2026-11-09** and its stated deadline is **November 15, 11:59 PM PST**, and the repository was created on GitHub during the competition period. Orylo is therefore **not** pre-existing code, and the sentence "built before this hackathon" that earlier drafts contained is **wrong and must not be used**. The rules also state that "Generative AI and other development tools are permitted" while requiring disclosure of "material pre-existing templates, code, or third-party assets". Suggested wording (Tier A, Orylo called from the eGain agent through an HTTP action):

"Orylo is an independent backend written during the hackathon period by the participant with AI coding assistance (Anthropic's Claude Code). It is called from the eGain agent through an HTTP action. It uses open-source libraries (Next.js, React, PostgreSQL drivers, Better Auth, and others listed in package.json). No pre-existing hackathon templates or lab assets are included. All content and data are synthetic and self-authored."

In Tier B or C, replace the second sentence with: "It is not called from the eGain agent in this entry." If any template from the hands-on lab or the Workflow Library was used inside eGain, the owner must add it here; this repository contains none.
