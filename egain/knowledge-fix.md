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
