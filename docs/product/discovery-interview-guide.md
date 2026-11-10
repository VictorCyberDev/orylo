# Discovery interview guide

**Status / evidence level:** Instrument only. No interviews have been conducted. This guide contains no responses, quotes or findings. Everything it tests is a hypothesis from `docs/strategy/`.

## Purpose

Learn how companies actually handle failed cancellations, repeat billing after a cancellation request, and other cross-system exceptions; whether they can tell if an exception was truly resolved; and whether this is painful enough to change behaviour or pay. Learn first, pitch never. Do not demonstrate or sell in these sessions.

## Who to interview

Support operators, support or operations leads, billing or finance owners, CX leaders, and (separately) people who have personally had a failed cancellation. Aim for at least 12-15 across roles before drawing patterns, and record the count beside every conclusion.

## Screening questions

Ask by short form or message before booking.

1. What is your role, and does your company sell subscriptions, digital services or connectivity?
2. Roughly how many support agents handle billing or cancellation contacts?
3. In the last 90 days, did a customer contact you after asking to cancel and being charged again? (Yes / No / Not sure)
4. Who handles that case: support, billing, or both?
5. Are you willing to talk for 45 minutes about a recent case, with customer details left out?

Include if: they have handled or supervised such cases in the last 90 days. Exclude: vendors selling competing products, and anyone who would only speak hypothetically. Record exclusions with reasons.

## Consent and recording notes

- Obtain consent before the session: purpose, how notes will be used, whether recording is optional, retention period, and the right to stop or skip any question.
- Recording is optional; default to written notes. Never record without a clear yes captured on the recording or in writing.
- Do not ask for customer names, account numbers or any personal data about third parties. If shared accidentally, strike it from notes.
- Do not ask participants to disclose confidential employer information; offer to keep the company anonymous.
- Do not pay or promise future discounts in exchange for specific answers. Any thank-you is stated in advance and is the same for everyone.
- Store notes in a controlled location; delete recordings at the stated retention date. Seek counsel on regional consent requirements before interviewing outside your own jurisdiction.

## 45-minute script

**Opening (3 min).** Introduce yourself, state the purpose, repeat consent and recording terms, and say there are no right answers. "I am not selling anything today."

**Context (5 min).**
- Tell me about your role and what a typical week looks like.
- Which systems do you use for support and billing?

**Last-case walk-through (15 min).** Anchor on one real, recent case.
- Think of the last time a customer said they had asked to cancel but were still charged. What happened first?
- Who did the customer talk to? How did the next person learn what had already happened?
- What did you look up, and in which systems?
- What did you decide, and what policy or rule did you rely on?
- What had to be approved, and by whom?
- What was actually changed, and how?
- How did you find out whether it worked?
- What did the customer hear, and when?

**Probes (use only as needed).**
- How long between the first request and the final fix?
- How many contacts did the customer make?
- What happened to the billing side: refund, credit, dispute, nothing?
- Did the ticket close before the problem was fixed? How would you know?
- What went wrong the last time something like this was marked done but was not?
- Who is blamed when this fails?

**Frequency and cost (7 min).**
- How often does this happen, roughly? (Accept "I do not know" and ask who would.)
- What does it cost you in time, escalations, chargebacks or churn? (Do not suggest numbers.)
- What have you tried to fix it, and why did it stick or not?

**Current tools and alternatives (5 min).**
- What do you use today to track these cases?
- If you could change one thing, what would it be?
- Would anyone else in the company need to approve a change in this process?

**Trust and risk (5 min).**
- What would a tool have to show you before you let it change a customer's account?
- How do you feel about software performing a correction on its own, with the customer's consent?
- What would finance need to be comfortable?

**Close (3 min).** Ask: "Is there anything I should have asked?" Ask who else to talk to. Thank them. Do not ask for a purchase commitment.

## Questions to avoid

Leading questions ("Wouldn't it be great if...?"), hypothetical commitments ("Would you buy...?"), and questions that name a price before they have described the problem. Price reactions come only late in the programme (see experiment E5 in `docs/strategy/03-market-hypotheses-and-pricing.md`) and are directional only.

## What evidence would falsify the hypotheses

| Hypothesis | Evidence that would count against it |
|---|---|
| The problem is frequent and costly | Most interviewees cannot recall a recent case, or say it happens a few times a year and is handled quickly |
| Closed is not the same as resolved | Interviewees consistently confirm the end state through a reliable existing step |
| Operators lose history across handoffs | Handoffs are routinely seamless in their stack |
| Finance wants support-initiated corrections tracked separately | Finance prefers support to issue corrections directly, or is indifferent |
| Customers want consent before correction | Customers prefer automatic correction without being asked |
| A verified-outcome unit is understandable | Interviewees misread it or prefer per-seat pricing |
| Buyers will pay for this | Interest only in a free internal tool, or no budget owner exists |

If three or more of these appear across a majority of interviews, revisit the wedge before further build.

## Notes template (blank)

Copy one per interview. Do not include real personal data.

```
Interview ID:            Date:            Interviewer:
Role (anonymised):       Company type:    Team size band:
Consent given (Y/N):     Recording (Y/N): Retention date:

Last case summary (no personal data):

Timeline of events and handoffs:

Systems touched:

How the end state was confirmed (or not):

Frequency / cost as stated (record "unknown" if so):

Current alternative / workaround:

Trust requirements stated:

Surprises:

Direct quotes (verbatim, consent permitting):

Hypotheses supported / contradicted (cite sample count):

Follow-ups and referrals:
```

## After each interview

Write notes within 24 hours. Tag observations as *observed*, *reported* or *inferred*. Update the risk register (`docs/strategy/05-commercial-risk-register.md`) and keep a running tally of supporting and contradicting evidence per hypothesis.
