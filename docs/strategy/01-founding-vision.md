# 01 - Founding vision

**Status / evidence level:** Draft 2026-11-10. Vision and positioning statements are beliefs held by the founder, not findings. No customer discovery has been done. "Orylo" is an uncleared working name; nothing here is a trademark or domain claim. All demo data is synthetic and fictional.

## Mission

Make it routine for a customer to get a real, checked outcome from a support interaction, and for the company to know exactly what happened.

## Category

**Verified Resolution Infrastructure**: a governed customer exception-resolution platform. It sits between a support interaction and a real, verified customer outcome.

## The central insight

Support tooling measures activity. Customers experience outcomes. The two are often confused:

| What the system records | What it does not prove |
|---|---|
| A chatbot conversation ended | The problem was solved |
| A refund request was generated | A refund was completed |
| A cancellation request was received | The subscription actually stopped |
| A complaint was escalated | The complaint was resolved |

Orylo's working belief (Hypothesis, unvalidated) is that the gap between these pairs is where customers lose trust and where operators lose visibility. The gap is widest for exceptions: cases that cross systems, teams or policies, such as a customer who asked to cancel and was charged again.

## How it works

Detect, Decide, Execute, Verify.

1. **Detect.** Find the exception and any earlier related history, so the customer does not start over.
2. **Decide.** Apply a versioned policy, check consent, and route to approval where required.
3. **Execute.** Perform only typed, idempotent actions through an Action Gateway.
4. **Verify.** Read the state back after the write. Record the result in an append-only, hash-chained Outcome Ledger.

## Promises

- **Customer:** "Never start over."
- **Operator:** "Know what happened, what matters and what can safely happen next."
- **Business:** Measure real outcomes, not conversations or closed tickets.

## Positioning (Hypothesis, unvalidated)

For growing subscription businesses, SaaS and digital-service companies, and ISPs or service operators, Orylo is the layer that turns a billing or cancellation exception into a verified outcome, with a record that an operator, finance owner or auditor can inspect. It complements the helpdesk and the conversational AI rather than replacing them.

*How we would test it:* describe the positioning in discovery interviews (see `docs/product/discovery-interview-guide.md`) without naming a product, and record whether interviewees volunteer the conversation-versus-outcome distinction unprompted.

## Principles

1. **Evidence before claims.** A status such as "Verified resolved" appears only when read-after-write evidence exists.
2. **Say what has not happened.** If a billing review is opened, the interface says no money has moved.
3. **Governed by default.** Policy is versioned; consent and approval are explicit and recorded.
4. **Narrow actions, typed and idempotent.** Retrying must never double-apply.
5. **Append-only memory.** The ledger is not edited; corrections are new entries.
6. **Human stays in control.** Operators can see why something is proposed and what can safely happen next.
7. **Calm tone.** Plain, precise and reassuring; no hype.

## What Orylo is not

- Not a chatbot or a replacement for the helpdesk.
- Not a payments processor. Orylo never moves money and never claims a refund. For billing disputes it opens a *billing review* and tracks it separately.
- Not a claim of compliance. No SOC 2, ISO or regulatory certification is held or implied.
- Not a general-purpose automation or RPA tool; actions are a small typed set.
- Not proven. There are no customers, no revenue and no measured results.

## Honest current maturity

| Area | State as of 2026-11-10 |
|---|---|
| Customer discovery | None done. Everything about demand is hypothesis. |
| Playbooks | One complete: Failed Cancellation and Billing Recovery. Also built: Missed Service Appointment Recovery and Warranty Claim Readiness (internal steps only; no external scheduling or claims systems are connected). |
| Data | Synthetic and fictional throughout. |
| Integrations | No live customer system connected. eGain trial access is not confirmed (see `docs/evidence/00-repository-baseline.md`). |
| Team | Single founder plus tooling; time-constrained. |
| Certifications | None. |
| Name | Uncleared working name. |

One go-to-market demonstration is an entry to the eGain AI Agent Hackathon. It is a demonstration, not validation: a hackathon result would say little about whether operators or finance owners would buy.

## What would change this vision

Evidence that would make us revise or abandon the core thesis is listed in `docs/product/discovery-interview-guide.md` ("What would falsify the hypotheses") and in `docs/strategy/05-commercial-risk-register.md`.
