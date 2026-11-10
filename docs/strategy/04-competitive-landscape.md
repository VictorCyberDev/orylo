# 04 - Competitive landscape

**Status / evidence level:** Partial and public-page-based. Facts in the "Verified facts" table were read from the public pages listed, retrieved 2026-11-10 using a page-fetch tool that summarises content. Page content can change and summaries may be imperfect. Everything else is labelled `Unverified` or `Hypothesis (unvalidated)`. This is not a feature comparison and makes no claim about any vendor's full capabilities. No vendor is criticised.

## Verified facts (public pages, retrieved 2026-11-10)

| Vendor / source | Fact as stated on the page | URL |
|---|---|---|
| eGain, AI Agent page | "A Resolution is defined as a conversation with a customer followed by 24 hours of silence." A "Conversation" is described as one where the AI Agent gives at least one response after the first non-trivial customer message. | https://www.egain.com/ai-agent-customer-self-service/ |
| eGain, hackathon page | Challenge is to build a customer-service AI agent that answers questions, guides users through a process and provides an escalation path. Judging has six criteria totalling 125 points, including "Action and good judgment" (25). Entrants may use an existing eGain account or create a trial account. The page lists no specific trial entitlements and no explicit terms on IP, use of submissions or billing. Submission deadline stated as November 15, 11:59 PM PST. | https://www.egain.com/ai-agent-hackathon/ |
| eGain, products page | Product names listed include AI Agent, Composer, Knowledge, and an Analytics Hub. Agentic Studio and Smart Evaluator appear by name only, without description on that page. No prices on that page. | https://www.egain.com/products/ |
| Intercom Fin, pricing page | Priced per outcome; resolution described as a conversation where "No further help is requested after Fin's last answer"; stated price of $0.99 per resolution; additional per-seat charge for Intercom helpdesk seats. Prices may change. | https://fin.ai/pricing |
| Zendesk, AI agents page | Describes AI agents that "execute actions across connected systems"; states AI agents are "included in every Suite and Support plan, with pricing based on the successful outcomes they deliver." No per-resolution price on the page. | https://www.zendesk.com/service/ai/ai-agents/ |
| Chargebee, Retention page | Describes a cancel experience "with personalized details designed to win them back" and cancellation insights. Page does not describe dunning inside Retention (a separate Chargebee Payments product is listed for failed-payment recovery) and does not address support-driven cancellation failures. | https://www.chargebee.com/retention/ |
| UiPath, agentic automation page | Describes agents that perceive, reason and act; says orchestration should coordinate agents, robots and people; says agentic systems should support human-in-the-loop and "autonomous auditing and monitoring capabilities". | https://www.uipath.com/automation/agentic-automation |

Observation (ours, from the above): several vendors price on a resolution or outcome basis, but the definitions differ and, in the two cases quoted, are based on the customer not asking for further help rather than on a checked end state in a downstream system. Whether any vendor also offers read-after-write verification is `Unverified`; we did not examine this.

Note on the eGain AI Agent URL: the page was fetched via https://www.egain.com/?p=30996; the tool inferred the canonical address above from the page breadcrumb and did not confirm it. Treat the canonical URL as `Unverified` and recheck.

## Categories

| Category | What these tools generally do (general knowledge, `Unverified` per vendor) | Where they may overlap with Orylo | Where they may not |
|---|---|---|---|
| Helpdesk suites | Ticketing, routing, macros, increasingly bundled AI | Case history; escalation | A cross-system, policy-governed, verified end state is `Unverified` |
| AI support agents | Answer questions, sometimes take actions in connected systems | The conversation layer Orylo sits behind | Independent post-action verification is `Unverified` |
| Workflow or RPA tools | Orchestrate steps across systems, with human review options | Execution and approval flows | Customer-facing consent, a support-specific ledger and playbooks are `Unverified` |
| Billing-recovery and dunning tools | Recover failed payments, run cancellation and win-back flows | Billing exceptions | Support-originated exceptions and tracking a dispute separately are `Unverified` |
| In-house builds | Scripts, internal tools, spreadsheets, billing-ops runbooks | Likely the main real alternative | Depends on the company's engineering capacity |
| Status quo | Manual follow-up by agents and finance | Very likely the most common alternative | Unknown cost; test in discovery |

## How Orylo is different (Hypothesis, unvalidated)

1. **The unit of value is a verified end state,** supported by read-after-write evidence in an append-only, hash-chained ledger, not a completed conversation.
2. **Consent and approval are first-class,** with versioned policy and recorded decisions.
3. **It never moves money.** A billing dispute becomes a billing review tracked separately, which may reduce finance and compliance concern. It also limits what Orylo can do, which may reduce buyer appeal.
4. **It is designed to sit beside other systems,** including an AI agent such as one built on eGain, a helpdesk and a billing platform.
5. **Customer continuity ("Never start over")** is a design goal across channels and sessions.

*How we would test it:* in discovery, ask what would make someone trust an outcome reported by a tool, and whether any current tool gives it. Ask buyers to name tools they use and verify capabilities on a live demo or documentation rather than from memory. If incumbents already provide verification and governance that buyers trust, the differentiation claim fails.

## What would weaken the differentiation

- A helpdesk or AI-agent vendor ships verified post-action checks (we have not checked whether this exists).
- Buyers are satisfied with ticket reopen rates as a proxy.
- The set of typed actions Orylo supports is too narrow to matter without deep integrations.

## Gaps in this analysis

- No competitor trials or demos were run.
- Pricing pages change; recheck before quoting any number.
- Vendors beyond those above (for example other helpdesk and billing platforms) were not examined.
- Third-party commentary on pricing was seen in search results but is not cited, because it comes from commercial sources with an interest in the comparison.

Next step: a structured review of 5-8 vendor documentation sets against a fixed checklist (action execution, consent, approval, verification, audit log), recorded with URL and date.
