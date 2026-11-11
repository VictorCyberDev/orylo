# Devpost update — text to paste (owner action; nothing was changed on Devpost)

Checked 2026-11-11 (public page, no login): https://devpost.com/software/orylo-verified-customer-resolution is live, still carries the original text, and shows "started about 4 hours ago". **I have no Devpost login and did not edit it; I cannot see its submission status or deadline from the public page.**
**Keep the founder story, the problem framing and "What I learned" exactly as they are.** Only the status facts below have moved on. Replace these passages; leave the rest.

**Deadline.** The Devpost submission page was reported as closing **Nov 13 2026 05:30 WAT**; the organizer's rules page says **Nov 15, 11:59 PM PST (= Nov 16 08:59 WAT)**. They disagree, so **treat Nov 13 2026 05:30 WAT as the cutoff** and submit before it. (From the public Devpost project page I could not verify either figure.)

## 1. Replace "Current integration status: …" with

> **Current integration status (2026-11-11).** Orylo is deployed publicly at https://orylo-demo.vercel.app (Vercel + a dedicated Postgres, synthetic data only; the judge page is /demo). The owner's eGain AI Agent is published and answers customer questions from the 12 Northfield policy documents with cited sources: in a live 13-case test **11 pass and 2 fail** (the failing transcripts are in the repository). **What is not done:** the agent does not call Orylo's action API (so no eGain-originated action has happened); the agent sometimes words things as if an action were already done ("a billing review has been opened") when it has not; its escalation reply is a generic "contact customer care" rather than callback + email; and the eGain chat bubble does not yet open inside Orylo's own pages on the public site, because eGain only admits its own origin until the site is added to the agent's allowed domains (the agent's own public page works). Orylo's actions are demonstrated on Orylo's portal, beside the agent, not through it.

## 2. Replace the "What I verified—and what remains" test paragraph with

> **Verified:** 139 unit, database-integration and security tests (real PostgreSQL) and 80 offline Chromium browser tests passed locally; GitHub Actions ran the same pipeline (see the repository's final report for the exact runs — several failed or were cancelled and are listed there, including a failure caused by an unused variable in a script I added). **Public site:** a separate acceptance suite against https://orylo-demo.vercel.app passes 6 of 8 checks (headers, no exposed credentials, reviewer-code gate, customer journey with a verified cancellation, a pending billing review and no refund, receipt verification including a tampered receipt being rejected, unauthorized access refused, admin pages); the other 2 fail until the eGain origin allow-list is updated. These are my own test results, not independent testing.

## 3. Replace "Live agent and video: Not yet available…" with

> **Live links:** Orylo: https://orylo-demo.vercel.app · judge page: https://orylo-demo.vercel.app/demo · eGain agent (public page): https://ai.egain.cloud/r9iv/system/web/apps/aiagent/cc/web/index.html?agentid=015f4f90-8772-4065-9e64-894b3615c5d3&platform=standalone&flavor=ss · video: `[owner to add the hosted URL]` (a 49-second screen recording is in the repository at docs/evidence/video/orylo-demo.mp4; it shows the eGain agent and Orylo as separate systems and says so). Reviewer sign-in details are given to organizers privately; none are published.

## Add to "Built with" (accurate additions)
`vercel`, `neon`, `docker`, `eGain AI Agent`.

## Do not claim
That the eGain agent takes actions or calls Orylo; that pre-chat, a guided process or two escalation options are configured in eGain; that the knowledge is flawless (2 of 13 cases fail); any customer/revenue/savings; that a pending billing review is a refund.
