# Brand voice and UX copy guide

**Status / evidence level:** Working guidance, not yet tested with users (see `docs/product/usability-research-plan.md`). "Orylo" is an uncleared working name. All example data is fictional.

## Voice

Calm, premium, intelligent, human, precise, reassuring.

| Quality | In practice |
|---|---|
| Calm | Short sentences. No urgency theatre. No capital letters for emphasis. |
| Premium | Considered wording; no slang; no gimmicks. |
| Intelligent | Say the reason, not just the result. |
| Human | Speak to a person; use "we" and "you". |
| Precise | Say exactly what has and has not happened. Use dates, times and names of things. |
| Reassuring | State what happens next and who is responsible. Never overpromise to soothe. |

## Core rules

1. **Claim only what evidence supports.** A state is named for what is known, not hoped.
2. **Say what has not happened.** Particularly about money.
3. **One idea per sentence.** Lead with the outcome.
4. **Name the next step and the owner.**
5. **No exclamation marks, no emojis, no hype.**
6. **Treat consent as a choice.** Both options are equally visible and neither is shaded.

## Status vocabulary

Statuses are used consistently across customer portal, operator console and emails. Each appears only when its condition is met.

| Status | Use only when | Customer-facing text example |
|---|---|---|
| Received | A request was logged | "We have your request." |
| Reviewing | Evidence is being gathered | "We are checking your account history." |
| Waiting for your consent | A proposed change needs a yes or no | "We need your decision before we change anything." |
| Waiting for approval | A person on the team must approve | "A member of our team is reviewing this." |
| Action taken | A change was performed, not yet checked | "We made the change. We are now checking it." |
| Verified resolved | Read-after-write evidence confirms the intended end state | "We checked, and your subscription is now cancelled as of 14 March." |
| Not yet verified | Action taken but verification is pending or failed | "We could not confirm the change yet. We are looking into it." |
| Review opened - no money has moved | A billing review exists and no refund or payment has been made | "We opened a billing review for the charge on 3 March. No money has moved. You will hear from us by 17 March." |
| Handed to a person | Automation stopped; a human owns it | "A person now owns this case: they will contact you by Friday." |
| Declined by you | Customer said no | "You chose not to proceed. Nothing has changed on your account." |

Never use "Resolved", "Fixed", "Refunded" or "Complete" without evidence. Never describe a billing review as a refund, credit or reversal.

## Do and don't

| Situation | Do | Don't |
|---|---|---|
| Cancellation confirmed | "Your subscription ended on 14 March. We checked your account to confirm." | "All done! You are cancelled!" |
| Cancellation not confirmed | "We sent the cancellation. We could not confirm it yet, so we will keep checking." | "Cancelled." |
| Billing dispute | "We opened a billing review. No money has moved." | "Your refund is on the way." |
| Escalation | "A person now owns this. You do not need to repeat anything." | "We are escalating your complaint." |
| Delay | "This is taking longer than we expected. Next update by Thursday." | "Sorry for the inconvenience, we appreciate your patience." |
| Operator hint | "Policy 4 (version 7) permits this. Customer consent is recorded." | "Safe to proceed." |

## Error-message pattern

Structure: **what happened, what it means for you, what to do next.** No blame, no jargon, no error codes in the headline.

- "We could not check the change on your account. Your subscription may still be active. We will try again at 14:00, and a person will review it if it does not succeed."
- "This link has expired. Request a new one, and your case history will still be here."
- Operator: "Verification failed: the billing system still shows an active plan. The action is recorded; do not retry. Escalate to billing review."

Avoid: "Something went wrong", "Oops", "Error 500", "Invalid request".

## Consent wording pattern

Show: what we will do, what it will change, what it will not change, how to reverse it if possible, and the choice.

> **Cancel your plan and correct the March charge?**
> If you agree, we will end your subscription on 14 March and open a billing review for the 3 March charge.
> This does not move any money. A person on our team will contact you about the charge.
> You can say no. Nothing will change.
> [Yes, go ahead] [No, do not change anything]

Rules: both buttons same visual weight; plain verbs; no pre-ticked boxes; record the exact wording shown and the time consent was given.

## Words and phrases to avoid

| Avoid | Reason | Use |
|---|---|---|
| "Refund processed / issued / on its way" | Orylo never moves money | "Billing review opened. No money has moved." |
| "Resolved" without evidence | Over-claim | "Verified resolved" only with evidence; otherwise "Action taken" or "Not yet verified" |
| "Guaranteed", "100%", "instant" | Over-claim | State actual timing |
| "Certified", "compliant", "SOC 2" | No certification held | Describe controls that exist |
| "Customers love", testimonial wording | No customers yet | Omit |
| "Seamless", "revolutionary", "game-changing" | Hype | Describe behaviour |
| "Unfortunately", "we regret" | Cold and defensive | State facts and next step |
| "Dear valued customer" | Impersonal | Use the person's name |
| "AI-powered" as a headline | Vague | Describe what is done |
| "Escalated" alone | Does not mean solved | "A person now owns this" |
| Exclamation marks, emojis | Tone | None |

## Naming

The product name is an uncleared working name. Keep it in a single configuration location so it can change. Do not use it in text that implies trademark ownership or in a domain claim.

## Tone by surface

- **Customer portal:** plainest language; reading age friendly; short; one decision per screen.
- **Operator console:** denser but still plain; show reasons and versions; use exact status words.
- **Emails and notifications:** subject lines state the fact ("Your cancellation is confirmed" only when verified).
- **Demo and marketing:** label as synthetic where relevant; no invented metrics.

## Review checklist before copy ships

1. Does each status claim have evidence behind it?
2. Does any line suggest money moved?
3. Can the reader tell what happens next and who owns it?
4. Is there any hype, exclamation mark or emoji?
5. Is the choice in a consent request equally easy to decline?
6. Are dates and amounts specific and fictional in demos?
7. Is copy readable at a short reading length and by a screen reader (no meaning carried by colour alone)?
