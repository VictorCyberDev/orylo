# Usability research plan

**Status / evidence level:** Plan only. No usability sessions have been run. No findings exist; the findings template at the end is intentionally empty. Test content uses synthetic, fictional data only.

## Objectives

1. Can an end customer understand a case on the customer portal, give or decline consent, and tell what has and has not happened?
2. Can a support operator find case history, understand the proposed step and its policy reason, and complete or hand off the case in the operator console?
3. Do participants correctly read the status vocabulary, especially "Verified resolved" versus "Review opened - no money has moved"?
4. Are both surfaces usable with assistive technology and keyboard only?

## Surfaces under test

- Customer portal (case status, consent request, confirmation).
- Operator console (case timeline, policy reasoning, approval, billing review, outcome ledger view).

## Participants and sample reasoning

| Group | Suggested n per round | Reasoning |
|---|---|---|
| Customers (people who pay for subscriptions or utilities) | 5-6 | Small rounds find most major usability problems in a given flow, which is the goal; they do not support percentage claims. Repeat after fixes. |
| Operators (support agents or leads) | 5 | Same reasoning; task-driven. |
| Finance or billing reviewers | 3 | Narrow task; check understanding of the billing review boundary. |
| Participants who use assistive technology | At least 3 per surface across screen reader, magnification and keyboard-only | Do not combine with the general group; accessibility problems are often different. |

Do not report completion rates as percentages with these samples; report counts (for example "4 of 6"). Run at least two rounds: baseline, then after fixes.

Recruit people who are not friends or family where possible. Compensation is fixed in advance and does not depend on answers.

## Accessibility participants

- Include people who use screen readers, screen magnification, speech input, switch or keyboard-only navigation, and people with cognitive or reading differences.
- Offer sessions in the participant's own environment and tools.
- Confirm accessibility needs before the session; allow extra time.
- Treat automated checks as a supplement, not a replacement. The target is conformance with WCAG 2.2 AA; no conformance claim is made until audited.

## Tasks

### Customer portal
1. Open the case link you received and describe, in your own words, what has happened so far.
2. A correction is proposed. Decide whether you consent, and explain what you think will happen.
3. Find out whether any money has moved on your account.
4. After the correction, tell us how you know whether the problem is fixed.
5. Decline a proposed step and say what you expect next.

### Operator console
1. Find the customer's earlier cancellation request.
2. Explain why the system proposes this action under the policy.
3. Approve or reject the action; note what you expect to happen.
4. Open a billing review and state what that does and does not do.
5. Find the evidence that a case is verified, and identify a case that is not.
6. Recover from an error state (for example a failed verification).

## Success measures

| Measure | Definition | Notes |
|---|---|---|
| Task completion | Completed unaided / with hints / failed (counts) | Report counts |
| Comprehension | Participant's restatement matches the intended meaning of the status | Scored by two raters against a rubric |
| Money misunderstanding | Any participant who believes a refund was issued when only a review opened | Target: zero; every instance is a severity-1 finding |
| Consent clarity | Participant can state what they agreed to | Open recall after the task |
| Time on task | Seconds, descriptive only | Not a pass-fail threshold at this sample size |
| Confidence (1-5) | Self-rated after each task | Directional |
| Errors and recoveries | Count and type | Qualitative notes |
| Accessibility blockers | Any task that cannot be completed with the participant's assistive technology | Every blocker is severity 1 |

Pre-registered decision rule: any severity-1 finding blocks the round from being called "passed".

## Session script (45 minutes)

1. **Welcome and consent (5 min).** Purpose, voluntary participation, optional recording, data handling, right to stop. "We are testing the product, not you."
2. **Background (3 min).** Short context questions; no personal data.
3. **Think-aloud practice (2 min).**
4. **Tasks (25 min).** Read each task aloud; do not lead. Neutral prompts: "What are you thinking?", "What would you expect to happen?" Offer a hint only after a stated time or on request; log it.
5. **Debrief (7 min).** Overall impressions; what was unclear; one word each for the way the product speaks to you (compare with the target tone in the brand guide).
6. **Close (3 min).** Thank, explain compensation, confirm deletion date.

Say at the start that all names, accounts and amounts are fictional.

## Logistics

- Moderator and a separate note-taker; second rater for comprehension scoring.
- Test environment seeded with synthetic cases covering success, declined consent, failed verification and a billing review.
- Pilot the script once internally and fix the script before recruiting.

## Reporting rules

1. Report what happened, with counts and the participant count.
2. Separate observation from interpretation.
3. Rate each finding by severity: 1 blocks understanding or accessibility, or implies money movement; 2 causes errors or hesitation; 3 minor.
4. Do not generalise beyond the sample.

## Findings template (empty)

| ID | Round | Surface | Task | Observation (what happened) | Participants affected (n of N) | Severity (1-3) | Evidence (note ref / clip ref) | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

**Round summary (empty):**
- Participants (n): 
- Tasks completed unaided (counts): 
- Severity-1 findings: 
- Accessibility blockers: 
- Decisions taken: 
