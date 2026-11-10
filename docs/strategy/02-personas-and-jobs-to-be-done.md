# 02 - Personas and jobs to be done

**Status / evidence level:** All content is `Hypothesis (unvalidated)`. These personas are assumptions drawn from the founder's reasoning and general knowledge of support organisations. They are not composites of interviews; no interviews have occurred. Names are role labels only; no real people are described.

## How to read this document

Each persona lists: context, jobs to be done (JTBD), pains we assume, what they would need to see to trust the product, and a "how we would test it" line. Jobs follow the form: *When [situation], I want to [motivation], so I can [outcome].*

## 1. Support operator (frontline agent handling exceptions)

**Hypothesis (unvalidated):** The operator is the daily user of the operator console.

- **JTBD:** When a customer says they already asked to cancel, I want to see the earlier request and the current account state in one place, so I can answer without making the customer repeat themselves.
- **JTBD:** When a correction is possible, I want to know what is allowed under policy and what still needs approval, so I can act without guessing or escalating by reflex.
- **Assumed pains:** reconstructing history across tools; uncertainty about what is permitted; no way to tell if a "done" ticket actually fixed anything.
- **Trust needs:** clear reasons for each proposed step; ability to see what has and has not happened.
- **How we would test it:** observe two or three operators handling a recent exception case (their own, anonymised) and time how long they spend finding history.

## 2. Support or operations lead

**Hypothesis (unvalidated):** The lead owns queue health and policy adherence.

- **JTBD:** When exceptions recur, I want to see which are resolved versus merely closed, so I can find where the process breaks.
- **JTBD:** When policy changes, I want the change versioned and traceable, so I can explain why two similar cases were handled differently.
- **Assumed pains:** closed-ticket counts that overstate success; inconsistent handling; reopen and repeat-contact rates that are hard to attribute.
- **How we would test it:** ask for the last three repeat-contact cases and trace whether the system of record shows the true end state.

## 3. Finance or billing owner

**Hypothesis (unvalidated):** Finance cares most that nothing unauthorised touches money.

- **JTBD:** When a customer is charged after asking to cancel, I want the dispute tracked as its own item with an owner, so billing corrections go through the normal finance process.
- **JTBD:** When reviewing exceptions, I want an inspectable record of who consented, who approved and what changed, so I can reconcile and answer audits.
- **Assumed pains:** support promising refunds finance has not approved; duplicate or untracked corrections.
- **Trust needs:** an explicit guarantee that the product does not move money; a ledger they can read.
- **How we would test it:** ask how support-originated billing corrections reach finance today and where they get lost.

## 4. Customer-experience executive

**Hypothesis (unvalidated):** The executive buys on outcome measurement and risk.

- **JTBD:** When reporting on service quality, I want a measure of problems actually fixed, so I can stop relying on conversation volume or ticket closure.
- **JTBD:** When considering AI in support, I want limits on what automation may do, so I can adopt it without exposing customers or the brand.
- **Assumed pains:** vanity metrics; fear of AI taking an action it should not.
- **How we would test it:** ask which metric they would defend to their board and how confident they are that it reflects customer reality.

## 5. End customer (the person with the exception)

**Hypothesis (unvalidated):** The customer wants the problem fixed once, with clarity.

- **JTBD:** When I have already asked to cancel and was charged again, I want someone to know my history, so I do not start over.
- **JTBD:** When something is proposed on my account, I want to understand it and say yes or no, so I stay in control.
- **JTBD:** When I am told it is fixed, I want to be able to see that it is, so I can stop worrying.
- **Assumed pains:** repeating the story; vague promises; no confirmation.
- **How we would test it:** usability sessions on the customer portal (see `docs/product/usability-research-plan.md`) and, separately, short interviews with people who have had a failed cancellation.

## 6. Admin or security reviewer

**Hypothesis (unvalidated):** This person gates adoption in any company with a security review.

- **JTBD:** When evaluating a new vendor, I want to know what data it reads, what it can write and who can approve, so I can assess blast radius.
- **JTBD:** When something goes wrong, I want an append-only record and a way to stop actions, so I can investigate and contain.
- **Assumed pains:** opaque AI actions; broad credentials; unclear data retention.
- **Honest note:** Orylo holds no certification. Expect this persona to ask for evidence we cannot yet provide.
- **How we would test it:** share an architecture summary with a reviewer and record every question we cannot answer.

## Persona-to-feature map (assumed)

| Persona | Primary surface | Value they would look for |
|---|---|---|
| Support operator | Operator console | Full history, allowed next steps |
| Support or ops lead | Console reports | Resolved versus closed |
| Finance owner | Billing review queue, ledger | No money moved by Orylo; inspectable record |
| CX executive | Outcome summary | Verified outcomes, not volume |
| End customer | Customer portal | Clarity, consent, confirmation |
| Admin or security reviewer | Policy and ledger views | Control and auditability |

## Open questions

- Is the buyer the support lead, the finance owner or the CX executive? Unknown.
- Does the operator or the customer initiate most cases?
- Are failed cancellations frequent enough to anchor a product? Unknown; see `docs/strategy/03-market-hypotheses-and-pricing.md`.
