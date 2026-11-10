# Knowledge sources for the eGain AI Agent

The twelve policy files listed in the manifest are the content to upload to the eGain AI Agent as its knowledge base. Do not upload this `README.md` or anything else. (The brief for this package mentioned eleven documents; `src/policy/pack.ts` contains twelve, and all twelve are included.)

## Provenance and authorization

- Every file is **synthetic and self-authored** by the Orylo project for a fictional provider, "Northfield Digital". No real company, customer, policy or personal data is described.
- Each file is the exact text of one `body` string in `src/policy/pack.ts` (the single source of truth for both Orylo's authorization rules and this knowledge). The text was extracted by a one-off script outside the repository, with no edits, and checked byte for byte against the evaluated TypeScript strings on 2026-11-10. Files carry no trailing newline, because the source strings do not.
- The header of `src/policy/pack.ts` names `npm run egain:export` as the maintained way to regenerate this directory. If that command exists when you read this, prefer it and diff the result against these files. If the policy pack changes, re-export and re-upload; never edit these files by hand.
- The hackathon rules require content that is owned or authorized, fictional, and free of personal data, passwords, account numbers and real customer records. These documents contain none of those. The only identifiers anywhere in this package are synthetic (for example `NF-100234`), and they are not in these files.
- The policy `rules` (machine-readable keys) are not uploaded. They live in Orylo and are what the Action API actually enforces. The prose below is what the eGain agent quotes.

## Manifest

| File | Title | Owner | Rule keys (enforced by Orylo) | Use in the hackathon agent |
|---|---|---|---|---|
| `cancellation-policy.md` | Cancellation Policy | Subscriber Operations | `cancellation.correction_allowed`, `cancellation.correction_window_days` | Core |
| `billing-policy.md` | Billing Policy | Billing Operations | `billing.review_allowed`, `billing.review_window_days` | Core |
| `duplicate-charge-investigation.md` | Duplicate Charge Investigation | Billing Operations | `billing.duplicate_charge_window_hours` | Core (answers only) |
| `refund-review-rules.md` | Refund Review Rules | Billing Operations | `billing.review_approval_threshold_cents`, `refund.automatic_refund_allowed` | Core |
| `identity-verification.md` | Customer Identity Verification | Trust & Safety | `identity.required_factors` | Core |
| `consent-requirements.md` | Consent Requirements | Trust & Safety | `consent.required_for_account_changes` | Core |
| `escalation-policy.md` | Escalation Policy | Support Leadership | `escalation.max_failed_attempts` | Core |
| `error-failure-handling.md` | Error and Failure Handling | Platform Operations | `failure.retry_with_same_key` | Core |
| `data-handling.md` | Data Handling Rules | Privacy Office | `data.retention_days` | Core (answers only) |
| `policy-authority-manifest.md` | Policy Authority and Version Manifest | Policy Council | none | Core |
| `service-appointment-policy.md` | Service Appointment Policy | Field Operations | `service.reschedule_allowed` | Optional, answers only |
| `warranty-policy.md` | Device Warranty Policy | Claims Operations | `warranty.coverage_months` | Optional, answers only |

"Core" documents support the Failed Cancellation & Billing Recovery assistant. The two optional documents belong to the other Orylo playbooks (missed appointment, warranty claim). The eGain agent has no workflow or action for them, so if they are uploaded it can only quote policy and then offer the two escalation options. Upload them only if broader content is wanted for the "content-based answer" in the demo; see `../intents.md` for the expected behaviour.

## Format note for upload

The files are Markdown. Public eGain material lists "Docs (PDF, Word, HTML)", websites and the eGain Knowledge Portal as content sources (https://www.egain.com/ai-agent-customer-self-service/). Whether the trial accepts `.md` directly is `UNVERIFIED — confirm in the trial UI`. If it does not, convert each file to HTML, Word or PDF **without changing any wording**, and re-read the converted text against the source before uploading.
