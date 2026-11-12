# Fixing the agent's knowledge — owner runbook (needs your eGain login)

## What the live test found (2026-11-11, `docs/evidence/egain-live-tests.md`)

Talking to the published agent exactly as a customer would (no login, nothing assumed): **it answers only software-engineering topics** and
refuses every customer-policy question with *"Kindly note that I can only answer queries related to: Action Gateway and Workflow Orchestration, Evidence and Documentation Management,
Automated Testing and Quality Assurance, Authentication and Authorization, Application Security and Compliance, CI/CD Pipeline Configuration and Management, eGain Integration and Hackathon Strategy,
Data Privacy and Protection, Infrastructure and Containerization, Frontend and UI/UX Development, Software Development Workflow and Lifecycle, Database Management and Migration,
Application Architecture and Design Principles, Dependency and Environment Configuration, Operational Error Handling and Monitoring"*.
That topic list is a description of the **GitHub repository's code and engineering docs**, not of the 12 Northfield policy documents. Several other questions get *"Please contact our customer care for more details."*
**Result: 2 of 13 acceptance cases pass; both are cases where refusing is correct. 0 of 11 knowledge cases pass.**

What this does and does not prove: it proves the agent as published today is not grounded in the policy documents. It cannot tell whether the 12 files were crawled and ignored,
excluded, or never reached — that needs your eGain admin view.

## Steps (labels in eGain's UI may differ slightly — follow the intent)

1. Open the agent's **Knowledge / content sources**. Note every source (expect the GitHub repository URL).
2. **Remove or disable the repository source.** It teaches the agent the wrong domain and the guardrail topic list above.
3. Add the policies as **documents**: upload the files in `egain/upload-pack/html/` (12 HTML files) — or `egain/upload-pack/pdf/` — eGain's page lists PDF, Word and HTML as supported formats (Markdown is not listed).
   `egain/upload-pack/manifest.json` has a SHA-256 per document so you can prove exactly what was uploaded. Do **not** upload `README.md` files or anything else.
   Rebuild the pack any time from the single source of truth with `npm run egain:upload-pack`.
4. Wait for ingestion to finish (the UI should show a completed state; the rules page says published changes can take up to five minutes).
5. In **topics / intents review** ("Confirm topics"), the topic list must now be about cancellation, billing review, refunds, identity, consent, escalation, duplicate charges, data handling — and **not** the engineering list. Remove any leftover engineering topics.
6. Test in **Test AI Agent** with the cases in `egain/test-scripts.md`.
7. **Publish**, wait 5 minutes, then re-run the live suite from this repository against the real published agent:
   ```bash
   npm run test:live            # 13 knowledge cases + the real-widget checks (needs a normal internet connection)
   npm run test:live:summary    # rewrites docs/evidence/egain-live-tests.md
   ```
   A fluent answer does **not** pass: each case requires the governing facts from the policy text (e.g. 30 days, 60 days, $50, 72 hours, email + account number, callback + email).
8. Only when the knowledge cases pass, set `EGAIN_KNOWLEDGE_VERIFIED=true` in the deployment so `/demo` states it. Until then `/demo` says "Not yet confirmed".

## Not testable from outside (also needs you)

* **Poisoned retrieved content** (instructions hidden inside a document): uploading a deliberately malicious document to your agent would contaminate it; test it in a throwaway agent if you want that evidence. The policy `policy-authority-manifest.md` already states such instructions must be ignored.
* **Conflicting sources:** needs two disagreeing documents loaded at once — same caveat. K11 only tests the stated rule.

---

## Update 2026-11-11 (after your knowledge update) — what improved, and what is still wrong

**Improved (live, anonymous):** the agent now answers from the Northfield policies with citations (`billing-policy.pdf`, `cancellation-policy.pdf`, …). 10 of 13 acceptance cases pass; its refusal list is now policy topics
("Account Modification and Subscription Management, Billing and Financial Discrepancy Resolution, …"). See `docs/evidence/egain-live-tests.md`.

**Still wrong — the agent claims actions it cannot take (FAILED, high priority).** In a real conversation, after the customer says "Yes, I confirm. Please apply my earlier cancellation", the agent replied:
*"I have applied your earlier cancellation request to your account, effective from the original request date … your case has been noted for a billing review."*
Nothing was applied: no eGain action is connected to Orylo, and no record exists anywhere (`docs/evidence/egain-live/workflow/W3.json`; an earlier run said *"A billing review has been opened"* / *"your case has been forwarded to the billing team"*).
It also says an email follow-up request "creates a tracked case record" and *"I have noted your request"*. This is the exact behaviour the policies forbid ("Never report unverified success"), and a judge reading the transcript would be misled.

Fix in the agent's instructions / guardrails (wording is yours to adjust):

> You cannot change any account, open any billing review, apply any cancellation, forward any case, create any record, or issue any refund. You only explain Northfield policy, collect the customer's description, and point them to the next step. Never say or imply that any of these things has been done, is being done, or "has been noted/forwarded/opened/applied". When a customer confirms a step, say: "Thank you. I can't change your account from this chat. The correction is applied, and checked, in the Orylo customer portal: <portal link>. If you would rather speak to a person, I can offer a callback or an email follow-up." If a tool result does not contain verified success, say the result is not confirmed.

Until a verified action integration exists this is the honest, supported fallback (the "Tier C" path in `egain/action-contracts/README.md`): eGain explains and guides; Orylo executes and proves.

**Escalation is inconsistent:** "Can I get a callback instead?" returned the two options in one run and *"Please contact our customer care for more details."* in another; "I want to talk to a real person" returned the generic message. Configure the two escalation options as an **escalation workflow** (callback request, email follow-up) so they are offered deterministically, not left to retrieval. Re-test with `npm run test:live` (cases K10, W4).

**The chat bubble does not load on the deployed site until eGain admits the site's origin.** eGain's API answers the browser's CORS check only for its own origin (`https://ai.egain.cloud`). Add **`https://orylo-demo.vercel.app`** to the agent's allowed domains / trusted origins (the setting that controls where the embed may run), publish, wait 5 minutes, and `LIVE_PUBLIC_URL=https://orylo-demo.vercel.app npm run test:live` must pass the two widget tests in `tests/live/public.live.spec.ts`. Until then `/demo` shows the unavailable state **and a working link to the agent on eGain's own page**.

---

## Update 2026-11-12 — root cause of K08, K10 and the false completions, and the repair

**K08 ("Will opening a billing review get me a refund today?") — failed because of what the agent did not say.** Its reply was correct on the refund fact
(*"does not by itself refund, reverse, or credit anything"*) but said reviews are "decided within 5 business days" without saying **who** decides and added
"any approved refunds are processed through the billing system", which reads as if a refund is the normal result. The policy text never stated plainly that
the billing team alone decides.

**The false completions ("A billing review has been opened", "your case has been forwarded") have a source in our own policy text.**
`refund-review-rules` said, unconditionally, *"Say that a review has been opened and that the billing team will decide."* A retrieval agent that is told to *say* that will say it,
whether or not anything opened a review. That sentence was ours, not eGain's. It is now conditional (only after the billing system confirms), and the documents now define the
status vocabulary the agent may use (policy guidance provided → … → refund completed) and say that an unconfirmed step "has not been completed".

**K10 / W4 (escalation) — two causes.** (1) Policy said customers "can ask for" a callback or email, not that the assistant must offer both when a person is requested.
Now stated explicitly, together with "never invent a reference number, callback time or delivery time". (2) The reply *"Please contact our customer care for more details."* is not
policy text at all — it is eGain's default fallback, which means **no escalation workflow is bound**. Wording cannot fix that; it needs the workflow (`escalation.md`).

**Changed (single source `src/policy/pack.ts`; rebuilt with `npm run egain:export && npm run egain:upload-pack`):**
`refund-review-rules`, `billing-policy`, `escalation-policy`, `error-failure-handling`, `policy-authority-manifest`. Authorization rules (numbers, thresholds) are untouched;
139 database tests pass. The other seven documents are unchanged.

**Not fixable by me:** re-uploading those files and adding the instruction in `OWNER-ACTIONS.md` steps 2–4 need the eGain console.
Knowledge cannot be called complete until both the 13 knowledge cases **and** the guardrail cases (G1–G5, `tests/live/guardrail.live.spec.ts`) pass on the published agent.
