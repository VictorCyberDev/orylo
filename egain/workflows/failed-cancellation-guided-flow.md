# Process workflow: Failed Cancellation & Billing Recovery (guided flow)

Status: **Prepared in repo.** Configured in eGain: `BLOCKED — no eGain tenant access in this environment`. Tested in eGain: `BLOCKED — no eGain tenant access in this environment`.

This is the customer-facing script and branch logic for the eGain process workflow. It is bound to intent **I-02** (`../intents.md`). The independent backend is Orylo; the eGain agent reaches it only through the HTTP Action described in `../action-contracts/openapi.yaml`. Whether eGain's trial can call that Action is `UNVERIFIED in trial` (see `../entitlement-audit.md`). If it cannot, use the fallback in section 12.

Orylo's own playbook is `failed-cancellation-billing-recovery` in `src/workflows/definitions.ts`: diagnose, triage, then propose the cancellation correction and/or a billing review, wait for verified outcomes, or escalate (no account, no charge, no safe action, lookup failure, timeout). This guided flow mirrors those branches. The eGain agent never decides eligibility itself; it reads the decision from the API.

## 0. Wording rules (apply everywhere)

| Rule | Detail |
|---|---|
| "Verified" | Say "Verified" only when the API returns `verification.verified = true` for that step. |
| Billing review | When the review is opened, say exactly: **"Review opened — no money has moved."** |
| Review awaiting approval | Say "Review requested — a team member must approve it first. No money has moved." Do not say "opened". |
| Refunds | Never say or imply "refunded", "will be refunded", "you will get your money back". Say the billing team decides. |
| Consent | Show the API's `consentText` verbatim. Treat only an explicit yes to that exact text (the confirmation control, or the customer's own words) as consent. Never infer consent from silence, an earlier message or a vague reply. |
| Secrets | Never show `customerToken`. Never ask for passwords or payment data. |
| Human | The customer can ask for a person at any step. Go to section 11 immediately. |
| Unknowns | If the API did not return a value, do not guess it. |
| Tone | Calm and plain. No exclamation marks, no emojis, no apologies beyond one clear sentence. |

Placeholders: `{name}` = `fullName`; `{amount}` = `disputedCharge.amountCents` formatted as dollars and cents; `{chargedAt}` and `{priorCancellationAt}` = dates in plain words; `{caseReference}`; `{receiptNo}`.

## 1. Entry (from intent I-02)

Agent: "Thanks, {name}. I'll check your account and your earlier request. This needs your email and account number from the form you completed, so I'll use those now."

Inputs read from session variables: `fullName`, `email`, `accountNumber`, built `issue` (see `../prechat.md`).

Action: `POST /api/v1/egain/sessions`.

## 2. Identity and diagnosis

### 2a. Response `verified = true`

Store `caseReference`, `customerToken`, `state`, `summary`.

Agent: "Thank you, that matches. I've opened case {caseReference} and checked your account."

Continue to section 3. If `state = ESCALATED`, go to Branch C. If `state = AWAITING_APPROVAL`, go to section 3 and expect the approval path (Branch D).

Note: the API resumes the customer's existing open case for the same workflow instead of opening a duplicate. If the customer has returned, the case may already contain executed actions. Always read the case (section 3) before proposing anything.

### 2b. Response `verified = false` — Branch A (cannot verify)

Agent: "We couldn't verify those details. You can try again or ask for a person."

Offer two choices: **Try again** and **Ask for a person**. Do not say which detail was wrong. Do not say whether an account exists.

- **Try again**: ask the customer to re-enter email and account number in chat (one retry only; do not suggest or guess values). Call the sessions endpoint again.
  - Second failure: "I still can't verify those details, so I'll stop here rather than guess. I can arrange for a person to help." Go to section 11. (Policy: after a failed verification, offer a human option and do not retry guesses — `knowledge/identity-verification.md`; two failed attempts — `knowledge/escalation-policy.md`.)
- **Ask for a person**: go to section 11.

If the customer says the account belongs to someone else, see Branch H.

## 3. Read the case and show the findings

Action: `GET /api/v1/egain/cases/{caseReference}` with `X-Customer-Token`.

Build the message from the response. Only state what the response contains.

Template (Jordan Reyes example, synthetic):

> "Here is what I found, {name}.
> - Earlier cancellation request: found, received {priorCancellationAt}.
> - Your account: still active.
> - Recent charge: {amount} on {chargedAt} ({description}).
>
> Under our cancellation policy, a request that was received but not applied has to be honoured, effective from the original request date, if it was made within the last 30 days and you confirm. Cancelling stops future billing; it does not refund past charges. Those are handled through a billing review, which the billing team decides."

Proposed steps come from `proposedActions`. Present them in this order if both exist: cancellation correction first, then billing review. Go to section 4 for each.

If `proposedActions` is empty or `escalations` contains an open item for this case, do not invent a step. Go to Branch C or section 11.

## 4. Consent (once per proposed action)

Show the action's `label` and its `consentText` exactly as returned. Provide two controls: **Yes, go ahead** and **No, don't do this**. Do not combine two actions into a single consent.

Example only (the real text is whatever the API returns):

> "Step 1 of 2: apply your earlier cancellation. {consentText}
> Do you want me to go ahead?"

- If the customer replies with anything other than a clear yes or no (for example "maybe", "what does that mean?", or a different question), answer the question from the knowledge base and ask again. Do not proceed.
- If the case changes between the consent and the action, the API returns `STALE_STATE`. The earlier yes no longer applies: re-read the case (section 3) and ask again with the new `consentText`. (`knowledge/consent-requirements.md`, Stale confirmations.)

## 5. Execute (customer said yes)

Action: `POST /api/v1/egain/cases/{caseReference}/actions/{actionId}/confirm` with `X-Customer-Token`, `Idempotency-Key = <eGain session id>-<actionId>` (8–120 characters), body `{"consent": true}`.

The key must be the same on any retry of the same action. A new action gets a new key.

Send `consent: true` only after the explicit yes in section 4. If the customer double-clicks or sends "yes" twice, the second call carries the same key and should return `DUPLICATE`, not a second change.

### Response handling

| API `status` | What the agent says |
|---|---|
| `EXECUTED` and `verification.verified = true` | Section 6. |
| `EXECUTED` and `verification.verified = false` or `verification = null` | "The request went through, but I couldn't confirm the result in your account, so I won't say it's done. I'll hand this to a person with the details." Go to section 11. (`knowledge/error-failure-handling.md`: never report unverified success.) |
| `DUPLICATE` | "That step was already applied, so nothing changed a second time. {verification.summary if verified}" Then read the case and continue with the next proposed step. |
| `DECLINED` | Branch E. |
| `AWAITING_APPROVAL` | Branch D. |
| `FAILED` | Branch F. |

## 6. Verification message (cancellation applied)

Only when `status = EXECUTED` and `verification.verified = true`:

> "Verified: your cancellation has been applied, effective {priorCancellationAt}. {verification.summary}. Your receipt number is {receiptNo}. Future billing is stopped."

Do not add more claims than `verification.summary` supports. If `receiptNo` is null, omit the receipt sentence and do not invent one.

If the customer asks how to check the receipt: "The receipt number can be checked without signing in at /api/v1/receipts/{receiptNo}/verify." (Give the full link only if the demo owner has decided to expose it; the base URL is in `../action-contracts/README.md`.)

Then move to the billing review step (section 7) if one is proposed.

## 7. Billing review

Repeat section 4 for the billing review action. Example consent step (real text from the API):

> "Step 2 of 2: open a billing review for the {amount} charge on {chargedAt}. A review asks the billing team to examine the charge. It does not refund or reverse anything by itself. {consentText}
> Do you want me to open the review?"

Execute as in section 5. Responses:

| API `status` | What the agent says |
|---|---|
| `EXECUTED` and `verification.verified = true` | "Review opened — no money has moved. {verification.summary}. Your receipt number is {receiptNo}. The billing team decides the outcome, normally within 5 business days, and you'll be told in your case." |
| `EXECUTED` without verification | As in section 5: do not claim it is done; go to section 11. |
| `AWAITING_APPROVAL` | Branch D. |
| `DECLINED` | Branch E. |
| `FAILED` | Branch F. |

## 8. Partial-resolution explanation

Use this whenever the cancellation is verified and the review is still open or awaiting approval, or when only one of the two steps could be done:

> "Here is where things stand, {name}.
> - Cancellation: verified. Future billing is stopped.
> - The {amount} charge: {Review opened — no money has moved. | Review requested — a team member must approve it first. No money has moved.}
>
> I can't tell you whether the charge will be returned. That decision belongs to the billing team, and I won't guess it. You'll see the outcome in case {caseReference}."

Before closing, always call `GET /api/v1/egain/cases/{caseReference}` once and compare the objectives and ledger with what was just said. If they disagree, say "I can't confirm that result in your account", and go to section 11 (`knowledge/error-failure-handling.md`).

## 9. Closing

> "Is there anything else I can help with? I can also arrange a callback or an email follow-up if you'd like a person to look at this."

If the customer says no: "Thank you, {name}. Your case reference is {caseReference}."

## 10. Branches

### Branch A — Cannot verify
See section 2b.

### Branch B — No earlier cancellation request
Triggered when `findings.priorCancellationFound = false`. Orylo's triage finds no permitted automatic action and escalates (`NO_SAFE_ACTION`), so `proposedActions` will normally be empty and `state = ESCALATED`. This is the Elena Rossi test identity.

> "I checked your account and I can't find a cancellation request from you, so I'm not able to apply one. I haven't changed anything. I don't want to guess what happened, so a person should look at this. I can arrange that in two ways."

Go to section 11. Do not suggest that the customer make a cancellation request through this assistant to "fix" the gap unless the knowledge base says so (it describes how to cancel in I-01; refer to that if the customer asks).

If the customer says the request was made longer than 30 days ago, the policy window has passed: "The policy only lets me apply an earlier request made in the last 30 days, so I can't do it here. A person can review it." Go to section 11.

### Branch C — Escalated by the backend
Triggered when `state = ESCALATED` or `escalations` is not empty (account not found, no charge found, no safe action, lookup failed, timeout).

> "I've passed this case to a person with the details so you don't have to repeat them. Nothing has been changed on your account."

Go to section 11 to let the customer choose how to be contacted.

### Branch D — Approval path (Priya Nair test identity: charge over $50.00)
Triggered when `AWAITING_APPROVAL` is returned for the billing review, or `needsApproval = true` on the proposed action. Policy: a review for a charge over $50.00 needs a team member's approval (`knowledge/refund-review-rules.md`).

Before consent:

> "Because this charge is over $50.00, a team member has to approve the review before it is opened. If you confirm, I'll send it for approval. Nothing is refunded or reversed by that."

After the API returns `AWAITING_APPROVAL`:

> "Done: your request is recorded and waiting for a team member's approval. It is not open yet, and no money has moved. You'll see the approval and the review in case {caseReference}."

Do not use "Verified" or "Review opened" until a later read of the case shows it. Do not poll in a loop in chat. If the customer asks for an update later, call `GET /cases/{caseReference}` once and report only what the ledger and objectives say.

### Branch E — Customer declines
At the consent step, send `{"consent": false}` to the confirm endpoint so the decision is recorded.

> "Understood. I haven't changed anything. You can still ask for a person, or come back to this later."

Do not repeat the offer more than once. Offer the escalation options (section 11).

### Branch F — Action fails or times out
Applies to `FAILED`, network errors, timeouts and 5xx-style failures.

1. First attempt fails: "That didn't go through. I'm trying once more. It's safe to retry: the same request cannot be applied twice." Retry **once** with the **same** `Idempotency-Key`.
2. Before retrying after a timeout, read the case (`GET /cases/{caseReference}`) and check the ledger. If the ledger shows the step done and verified, report that (section 6) and do not retry.
3. Second attempt fails: "I couldn't complete this, and I don't want to leave you guessing. Nothing is confirmed as changed. I'll hand this to a person with everything we've done so far." Go to section 11.
4. For `RATE_LIMITED`, wait briefly and retry once. For `UNAUTHENTICATED` or an expired token (30 minutes), call `POST /sessions` again with the same pre-chat details to obtain a new token ("I've refreshed your secure session."), then re-read the case and re-ask for consent if the action has not yet been executed.
5. For a system outage: "That system isn't available right now. I've kept your case open and I can arrange for a person to follow up." (`knowledge/error-failure-handling.md`, Outages.)

Never describe a failed step as done, and never say money has moved.

### Branch G — Account already cancelled (Marcus Bell test identity)
Triggered when `findings.accountStillActive = false`. Orylo marks the cancellation objective not applicable and proposes only the billing review.

> "Your subscription is already cancelled, so there's nothing further to stop. I do see a {amount} charge on {chargedAt} ({description}), which can be reviewed. I can open a billing review for you. It asks the billing team to examine the charge. It doesn't refund or reverse anything by itself."

Continue at section 7. Then section 8 with the cancellation line replaced by: "Cancellation: already in place before this chat."

### Branch H — Acting for someone else
If the customer says the account is not theirs: "An account can only be changed by the person it belongs to, so I can't act on it. A person can talk with the account holder." Offer section 11. Do not confirm or deny that the account exists.

### Branch I — Customer asks about refunds or outcomes at any step
Use I-06 or U-01 wording. Do not predict the decision.

### Branch J — Customer asks for a person at any step
Section 11, immediately, with no further questions beyond which option they prefer.

## 11. Handoff

Show the two options and nothing else. Details are in `../escalation.md`.

> "I can arrange either of these:
> 1. **Callback request** — a person phones you (demonstration number: +1 (555) 010-0100).
> 2. **Email follow-up** — a person emails you (demonstration address: support@demo.orylo.example).
> Which would you prefer?"

When the customer chooses, ask for a preferred time window only for a callback, then call `POST /api/v1/egain/cases/{caseReference}/escalations` with the channel and a reason that summarises what was checked, tried, failed and confirmed (no secrets). If no case exists yet (for example verification failed), do not call the API; use the eGain escalation workflow's own routing only and state this plainly.

Confirmation to the customer uses the API's `message`, then: "I've sent what we've covered, so you won't need to repeat it."

## 12. Fallback if the HTTP Action cannot be used in the trial

The guided flow still runs, with these changes, and the submission must say so:

- Sections 2, 3, 5 and 7 cannot call Orylo. The agent cannot verify identity, read findings, or take the actions. It must **not** present any finding, receipt or "Verified" statement.
- The agent asks the customer to describe what happened (already captured in `issueSummary`), explains the relevant policy from the knowledge base (cancellation correction within 30 days, billing review within 60 days, no automatic refunds), states that it cannot check or change the account from here, and goes to section 11 with the context from the pre-chat form.
- The submission description and demo video must not show or describe an action as taking place. See `../docs/hackathon/submission-description.md` and `../docs/hackathon/demo-script-60s.md`.
