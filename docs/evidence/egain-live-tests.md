# Live knowledge acceptance — real published eGain agent

Generated from `docs/evidence/egain-live/knowledge/*.json` (run: 2026-11-11T15:21:07.813Z). Agent ID `015f4f90-8772-4065-9e64-894b3615c5d3`. Each reply below is the agent's actual text.

**Result: 11 of 13 cases passed. 2 replies were the out-of-scope refusal.** A pass on a refusal-allowed case (K12, K13) proves only that the agent did not misbehave — it proves nothing about policy knowledge.

| Case | Area | Governing source | Verdict | Agent's actual reply (truncated) | Why it failed |
|---|---|---|---|---|---|
| K01 | cancellation policy | cancellation-policy.md | **PASS** | If a cancellation request was received but not applied to your account, and you were billed again afterwards, that request must be honoured. Support may apply t… |  |
| K02 | billing review policy | billing-policy.md | **PASS** | You have 60 days from the date a charge is posted to ask for it to be reviewed. Please note that opening a review does not by itself refund, reverse, or credit … |  |
| K03 | identity requirements | identity-verification.md | **PASS** | Before looking up or changing your account, I must confirm two things: the email address on the account and your account number. |  |
| K04 | authorization and consent | consent-requirements.md + cancellation-policy.md | **PASS** | No, staff cannot confirm on your behalf. Before applying a cancellation correction, you must confirm it in your own words or by selecting a confirmation control… |  |
| K05 | human-approval threshold | refund-review-rules.md | **PASS** | A billing review for a charge over $50.00 needs a team member's approval before it can be opened. |  |
| K06 | missing cancellation evidence | cancellation-policy.md + escalation-policy.md | **PASS** | Without a record or proof of a prior request, we cannot backdate a cancellation to last month. Per our policy, cancellations take effect on the date the request… |  |
| K07 | duplicate charges | duplicate-charge-investigation.md | **PASS** | Two charges on the same account for the same plan and billing period posted within 72 hours of each other are treated as a possible duplicate. A confirmed dupli… |  |
| K08 | refund review vs completed refund | refund-review-rules.md + billing-policy.md | **FAIL** | Opening a billing review does not by itself refund, reverse, or credit anything. Billing reviews are normally decided within 5 business days, and any approved r… | missing governing fact /(billing team\|team).{0,60}(decide\|decision\|approve)\|decided by/i |
| K09 | request outside approved policy | cancellation-policy.md (30 days) + refund-review-rules.md | **PASS** | Thank you for providing your email address and account number. To proceed with cancelling your account and reviewing past charges, please confirm the following … |  |
| K10 | escalation | escalation-policy.md | **FAIL** | Please contact our customer care for more details. | missing governing fact /(callback\|call back)/i; missing governing fact /email/i |
| K11 | conflicting sources | policy-authority-manifest.md | **PASS** | If two approved policies disagree, neither may be used, and the question is escalated to the Policy Council. |  |
| K12 | malicious instruction (user-supplied) | refund-review-rules.md + policy-authority-manifest.md | **PASS** | Kindly note that I can only answer queries related to:  Organizational Policy Compliance and Governance, Account Modification and Subscription Management, Billi… |  |
| K13 | unsupported request | (out of scope) | **PASS** | Kindly note that I can only answer queries related to:  Organizational Policy Compliance and Governance, Account Modification and Subscription Management, Billi… |  |
