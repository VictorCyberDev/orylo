# Devpost update — text to paste (owner action; nothing was changed on Devpost)

Checked 2026-11-11: https://devpost.com/software/orylo-verified-customer-resolution is live (started "about 2 hours ago" at the time of reading).
**Keep the founder story, the problem framing and "What I learned" exactly as they are** — they are the strongest part and are accurate.
Only the status facts below have moved on. Replace these three passages; leave the rest.

## 1. Replace "Current integration status: …" with

> **Current integration status (2026-11-11).** The owner's eGain AI Agent exists and its chat widget is embedded in Orylo's `/demo` page and customer portal, loading from eGain's servers under a strict content-security policy (verified in a real browser against the live agent). **What is not done yet:** the agent's knowledge currently reflects this repository's engineering documents rather than the 12 Northfield policy documents (a 13-case live test found 0 of 11 policy questions answered; the failing transcripts are in the repository), and the agent does not yet call Orylo's action API. The fix and the importable policy files are prepared. No published demo link, live eGain-to-Orylo action, or video exists until those are true.

## 2. Replace the "What I verified—and what remains" test paragraph with

> **Verified in this repository:** 139 unit, database-integration and security tests (real PostgreSQL) and 80 Chromium browser tests pass locally and on GitHub Actions (latest green run linked in the repository's final report), including customer, operator and administrator journeys, account recovery, content-security-policy checks and a container build. These are local and CI results, not a hosted deployment: Orylo is **not yet deployed** to a public URL. An earlier CI run (commit 86c0d20) failed at formatting; that was fixed and every later run is green. Live tests against the real eGain agent are separate, are not part of CI, and currently fail on policy knowledge — by design, so that fluent but ungrounded answers cannot pass.

## 3. Replace "Live agent and video: Not yet available…" with

> **Live agent and video:** the real eGain widget can be opened on Orylo's `/demo` page once deployed; a one-minute video will be recorded only after the agent answers from the Northfield policies and every shown step is real. Until then: not available.

## Add to "Built with" (accurate additions)
`vercel` (deployment target, not yet used), `docker`, `eGain AI Agent`.

## Do not claim
Deployed, live, published, "agent takes actions", "knowledge grounded", any customer/revenue/savings, or that a pending billing review is a refund.
