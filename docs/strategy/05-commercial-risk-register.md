# 05 - Commercial risk register

**Status / evidence level:** Draft 2026-11-10. Likelihood and impact are qualitative judgments by the founder-side author, not measured. Owners are placeholders. Review monthly and after each batch of discovery interviews.

Scale: Likelihood and Impact are Low / Medium / High. "Early signal" is the cheapest observable indicator that the risk is materialising.

| ID | Category | Risk | Likelihood | Impact | Mitigation | Owner | Early signal |
|---|---|---|---|---|---|---|---|
| R1 | Market | Failed cancellations and billing exceptions are too rare or too low-cost to anchor a product. | Medium | High | Quantify incidence in discovery before further build; keep playbooks modular so the wedge can change. | [owner TBD] | Interviewees report fewer than a handful of cases per month, or say existing cancel flows already solve it. |
| R2 | Market | Buyers do not distinguish "closed" from "verified resolved" and will not pay for the difference. | Medium | High | Test the framing in E2 (doc 03); be ready to reframe around finance risk or audit. | [owner TBD] | Interviewees equate ticket closure with success and show no interest in verification. |
| R3 | Market | The real alternative is a manual process or in-house script that is "good enough". | High | Medium | Learn the actual cost of the manual path; position as reducing that cost, not replacing a vendor. | [owner TBD] | Interviewees describe a spreadsheet or runbook with which they are content. |
| R4 | Market | Incumbent helpdesk or AI-agent vendors add comparable verification and governance. | Medium | High | Stay close to category pages; specialise in cross-system evidence and the ledger; remain complementary. | [owner TBD] | A vendor release note or documentation page describing post-action verification (not yet checked). |
| R5 | Product | The set of typed actions is too narrow to be useful without deep integrations. | High | High | Prioritise one integration path with a design partner; be explicit in marketing about what is connected. | [owner TBD] | Pilot teams ask for actions we do not support in the first session. |
| R6 | Product | Verification gives false assurance (read-after-write passes while the downstream system later reverts). | Low | High | Define verification windows; allow re-verification; show verification time and source in the UI. | [owner TBD] | A verified case is later contradicted by the system of record. |
| R7 | Technical | Idempotency or ledger defects cause duplicate actions or an inconsistent audit trail. | Low | High | Property and replay tests; hash-chain verification job; no production-money actions exist by design. | [owner TBD] | Test failures on replay; ledger verification mismatch. |
| R8 | Technical | Dependence on third-party systems whose APIs change or rate-limit. | Medium | Medium | Adapter boundaries; contract tests; clear degraded-mode messages. | [owner TBD] | Intermittent adapter failures in test runs. |
| R9 | Legal / brand | "Orylo" is an uncleared name and may conflict with an existing mark or domain. | Medium | Medium | Run a clearance search with counsel before any public launch; avoid logos or claims of ownership; keep the name swappable in code and copy. | [owner TBD] | A conflicting mark or objection found in a search. |
| R10 | Legal / brand | Copy implies money movement, a refund or a legal outcome. | Low | High | Copy guide (status vocabulary) enforced in review; billing review wording; legal review before pilots. | [owner TBD] | Reviewer or tester reads a screen as promising a refund. |
| R11 | Data / privacy | Handling personal and billing data in pilots without adequate controls. | Medium | High | Synthetic data until controls exist; data minimisation; written data scope per pilot; consult counsel on applicable privacy law. | [owner TBD] | A pilot requests production personal data before controls are documented. |
| R12 | Data / privacy | Recording interviews or usability sessions without proper consent. | Low | Medium | Consent script and written consent; recordings optional; retention limit stated. | [owner TBD] | A participant objects or consent is not captured. |
| R13 | Security / trust | Security reviewers require certifications (for example SOC 2) that Orylo does not hold. | High | Medium | State plainly that none is held; publish architecture summary and controls actually implemented; plan certification only after demand evidence. | [owner TBD] | First security questionnaire returns blocked items. |
| R14 | Dependency | eGain trial entitlements may not include the features the demo needs (agent actions, publishing, connectors, APIs). | High | Medium | Ask the questions in `docs/product/egain-commercial-licensing-questions.md`; keep the core product independent of eGain; describe the demo only as far as it can be verified. | [owner TBD] | A needed feature is unavailable or unpublishable in the trial tenant. |
| R15 | Dependency | Post-hackathon use of work built on eGain may be restricted, or the trial may expire. | Medium | Medium | Confirm terms in writing before relying on the work commercially; keep a platform-neutral version of the playbooks. | [owner TBD] | No clear written answer on permitted use. |
| R16 | Dependency | Positioning against eGain's resolution-based billing is read as criticism and harms the relationship. | Low | Medium | State the definitions neutrally and quote the source; avoid comparative claims. | [owner TBD] | Negative response from eGain contacts. |
| R17 | Single founder / time | One person cannot build, run discovery and sell at once; hackathon deadlines crowd out research. | High | High | Fix a weekly discovery quota; cut scope before cutting research; defer new playbooks. | [owner TBD] | Fewer than the planned interviews completed in two consecutive weeks. |
| R18 | Single founder / time | Key-person dependency: knowledge exists only in one head and one repository. | Medium | Medium | Keep decisions in `docs/`; short runbooks; backups. | [owner TBD] | Undocumented decisions found during review. |
| R19 | Over-claiming | Demo or materials imply real customers, results or certification. | Medium | High | Label all data synthetic; use the "Unverified" and "Hypothesis" labels; pre-publication checklist. | [owner TBD] | A reviewer asks "which customer is this?" about demo content. |
| R20 | Over-claiming | A hackathon outcome is presented as market validation. | Medium | Medium | Report it as a demonstration only; separate it from discovery evidence. | [owner TBD] | Hackathon results cited in a pitch without that qualification. |
| R21 | Over-claiming | Pricing tiers are read as committed offers. | Medium | Low | Mark as experiments; no checkout or contract language. | [owner TBD] | Inbound requests to buy at the stated price. |
| R22 | Product / ethics | Automated actions harm customers if policy is mis-specified. | Low | High | Consent and approval gates; versioned policy; reversible or review-only actions; kill switch. | [owner TBD] | A policy test case produces an action outside intent. |

## Review process

1. After each discovery batch, update likelihood and impact based on evidence, citing the interview count.
2. Add any risk raised by a participant, using their anonymised phrasing only if consent permits.
3. Retire a risk only with a written reason.

## Top three to watch first (judgment, unvalidated)

R1 (is the problem big enough), R5 (is the product useful without deep integrations) and R17 (time). Early discovery addresses R1 and R2 at low cost.
