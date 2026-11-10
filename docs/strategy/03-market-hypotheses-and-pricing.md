# 03 - Market hypotheses and pricing

**Status / evidence level:** Everything below is `Hypothesis (unvalidated)` unless explicitly cited. No market sizing, demand data, conversion rate or willingness-to-pay exists. Price points are provisional experiments, not offers. Competitor facts cited here were retrieved on 2026-11-10 and are detailed in `docs/strategy/04-competitive-landscape.md`.

## Segment hypotheses

| # | Hypothesis (unvalidated) | How we would test it |
|---|---|---|
| S1 | Growing subscription businesses (SaaS, digital services) have a recurring class of billing and cancellation exceptions that cross support and billing systems and are handled manually. | Ask 10+ support or billing leads to count such cases in the last 30 days and describe how each was closed. |
| S2 | ISPs and service operators have failed cancellations, incorrect billing and incomplete service changes that generate repeat contacts. | Same screening; compare repeat-contact handling stories. |
| S3 | These companies cannot currently tell whether an exception was actually resolved, only whether a ticket closed. | Ask: "For the last case, how did you confirm the end state?" Count how often the answer is "we did not." |
| S4 | Finance or billing owners will accept support-initiated corrections only if money movement stays under finance control. | Probe attitude to a "billing review opened, no money moved" model. |
| S5 | Companies with a helpdesk and an AI agent already in place still have a gap between a "handled" conversation and a verified end state. | Ask what happens after the AI agent or agent marks a conversation resolved. |

Segment sizes are not estimated here. Any figure would be fabricated at this stage.

## Wedge hypothesis

**Wedge (Hypothesis, unvalidated):** Failed Cancellation and Billing Recovery. The scenario is concrete (customer asked to cancel, was charged again), has a clear verification condition (service and billing state after the correction) and a natural boundary (a billing review, never a refund by Orylo).

*Why this wedge might fail:* the incidence may be low, the cost per case may be small, or companies may already fix it with a cancel-flow or billing-ops process. See risks in `docs/strategy/05-commercial-risk-register.md`.

*How we would test it:* the falsification criteria in `docs/product/discovery-interview-guide.md`.

Expansion playbooks (Missed Service Appointment Recovery, Warranty Claim Readiness) are built as internal-step demonstrations only. No external scheduling or claims systems are connected. They are not part of the wedge claim.

## Pricing hypothesis

### Billable unit: a verified customer outcome

Orylo's intended billable unit is a **verified customer outcome**: an exception for which the Outcome Ledger holds read-after-write evidence that the intended end state was reached. A conversation that ended, a ticket that closed, or a request that was generated is not billable.

### Contrast with eGain's billable conversation resolution

eGain's public AI Agent page (retrieved 2026-11-10, https://www.egain.com/ai-agent-customer-self-service/) states: "A Resolution is defined as a conversation with a customer followed by 24 hours of silence." That is a definition based on conversation inactivity. Orylo's definition is deliberately different: it requires evidence of the end state. The two are not substitutes, and Orylo should never describe its outcomes as equivalent to eGain's resolutions or imply that eGain's meter is wrong. They measure different things for different purposes.

For context only: other vendors define resolution differently (for example, Intercom's Fin pricing page, retrieved 2026-11-10, says a resolution is where "No further help is requested after Fin's last answer"). See document 04.

### Early-access tiers (experiments, not offers)

| Tier | Price (provisional) | Included verified outcomes | Intent of the experiment |
|---|---|---|---|
| Pilot | $0 | Small cap, to be set per pilot (no number is proposed here) | Learn from real or realistic cases; exchange for feedback and permission to measure |
| Team | about $490/month | To be determined by experiment | Test whether a small team will pay a flat amount tied to a verified-outcome allowance |
| Scale | about $1,490/month | To be determined by experiment | Test whether higher allowance, more playbooks and review workflows justify a step up |

The metric is "included verified outcomes per month". Inclusion counts and overage rules are intentionally left blank until we learn typical exception volumes. These price points are anchors to provoke reactions, not derived from cost modelling or competitor benchmarks.

### Pricing principles

1. Charge for evidence, not for activity. An unverified or failed attempt is not billed.
2. No charge for retries of the same exception (idempotency applies to billing too).
3. Make the count auditable: each billable outcome links to its ledger entry.
4. Orylo never takes a percentage of money recovered or refunded, because it never moves money.

## Experiments to validate

| ID | Question | Method | Success signal | Falsifying signal |
|---|---|---|---|---|
| E1 | Is the failed-cancellation exception frequent and costly enough to matter? | 10-15 discovery interviews; ask for last-30-day counts | Majority describe recurring cases with repeat contacts | Most say rare or already solved |
| E2 | Do buyers recognise "resolved versus closed" as a gap? | Interview probe S3 | Unprompted stories of "closed but not fixed" | Confidence that closure equals resolution |
| E3 | Will a finance owner accept the "billing review, no money moved" boundary? | Show a static mock; record reaction | Relief or preference for the boundary | Demand that Orylo issues refunds |
| E4 | Is "verified outcome" an understandable billing unit? | Show tier table; ask them to restate the unit | Accurate restatement without prompting | Confusion or preference for per-seat |
| E5 | Where is the price reaction? | Van Westendorp-style questions in later interviews (small samples; treat as directional only) | Responses cluster near or above anchors | Responses far below $490/month |
| E6 | Will a pilot team share enough data to measure outcomes? | Offer a Pilot with defined data scope | At least one team agrees and supplies a case set | Data access repeatedly blocked |
| E7 | Does the security reviewer need certification before a pilot? | Share architecture summary with reviewers | Pilot proceeds with synthetic or limited data | Hard stop absent certification |
| E8 | Do eGain-platform users see value in an outcome layer on top? | Post-hackathon conversations, subject to eGain permission | Interest in a joint pilot | No interest, or terms prohibit it (see `docs/product/egain-commercial-licensing-questions.md`) |

## Sample-size caution

Fewer than about 15 interviews cannot support quantitative claims. Treat all early results as qualitative signals and record the sample size next to any statement.
