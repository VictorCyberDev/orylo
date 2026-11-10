# Experience principles and information architecture

**Status / what this describes:** The experience principles that the built product follows, with the place each one shows up in the code, and the real route structure and per-role navigation as implemented on 2026-11-10 (`src/app/**`, `src/components/app-nav.ts`, `src/domain/rbac.ts`). Written from the code and tests. No user has validated these principles or this structure. Gaps found while reading are listed in each section. All data is synthetic; "Orylo" is an uncleared working name.

## 1. Experience principles

| # | Principle | Where it shows up | Gap found |
|---|---|---|---|
| 1 | **Never start over.** Find the history; ask only for what is missing. | eGain session resumes the customer's open case (`createEgainSession`; tested in `egain-api.spec.ts`). `InfoForm` renders only pending fields. Escalations carry a frozen context snapshot. Reopening keeps the full history. | The portal's "Start a case" always creates a new case; it does not offer the open one. |
| 2 | **Truthful status.** A state is named for what is known. | Fourteen state labels (`STATE_LABEL`). Objectives have separate statuses, including "Done — not yet verified". `VerifiedSeal` is rendered only for ledger entries that are `VERIFIED` and have `verifiedAt`. The case reaches Verified resolved only through the system actor (`case-machine.ts`). Tested: "2 of 3 verified", "Everything is done and verified." absent until the operator records the decision (`journey.spec.ts`). | The 14 labels do not map one to one to the 10 status words in `brand-voice-and-ux-copy-guide.md` (for example "With a human" against "Handed to a person"; "Investigating" against "Reviewing"). Reconcile before user testing. |
| 3 | **Consent before action.** The exact words are shown, a no is possible, the wording is stored. | `ActionCards` shows the stored consent text in a quotation block with "You can say no — nothing will change." Staff cannot consent for a customer (`grantConsent` allows only customer or channel actors). | "Yes, go ahead" is a filled primary button and "No, don't do this" is an outlined secondary button. The copy guide asks for equal visual weight. |
| 4 | **Evidence before buttons.** Show what was found, and why, before offering controls. | Operator case page order: Recommendation (with reason), diagnosis, actions, staff steps, escalations, ledger, timeline. Case controls sit in the side column and offer only transitions legal for staff. | None found. |
| 5 | **Say what has not happened.** | "What we don't know" on the customer page. "No money has moved" in ledger summaries. Billing review copy never says refund. | None found. |
| 6 | **A person is always reachable.** | "Talk to a person" on every customer case page; two tracked options (callback, email). | The panel is also rendered in states from which a customer escalation is not a legal transition (`VERIFIED_RESOLVED`, `CANCELLED`); read from code, not tested in a browser. |
| 7 | **Least surprise for staff.** | Navigation and command palette are filtered by permission. A page the role may not open redirects to `/app?denied=1` with an explanation. Approval cannot be given by the requester. | Workflows page needs `workflow.write`, so an approver cannot reach it to publish (see section 4). |
| 8 | **Calm and accessible.** | Tokens meet AA by design (`design-tokens-and-components.md`). Reduced motion draws the seal statically. Skip link first in tab order. | Conformance is not claimed; see `accessibility-audit-checklist.md`. |

## 2. Site map

### Public site (no sign-in)

| Path | Purpose |
|---|---|
| `/` | Positioning, resolution explorer, solutions list |
| `/product` | How it works (Detect, Decide, Execute, Verify) |
| `/solutions`, `/solutions/[slug]` | Five solution pages: `subscription-billing-recovery`, `telecom-service-operations`, `warranty-claim-readiness` marked working (synthetic); `digital-commerce-exceptions`, `general-customer-operations` marked roadmap |
| `/pricing` | Provisional pricing experiments, labelled as not market prices |
| `/security` | Controls that exist; states that no certification is held |
| `/about`, `/contact` (lead form), `/demo` (demo accounts), `/legal/privacy`, `/legal/terms` (both marked draft) | Company, access request, try-it, legal drafts |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image`, `/icon.svg` | Metadata; robots disallows `/app`, `/portal`, `/api`, `/invite` |

### Account routes

`/sign-in`, `/forgot-password`, `/reset-password?token=`, `/invite/[token]`, and `/portal/access/[token]` (a route handler that sets a cookie and redirects).

### Customer portal (`/portal`, customer identity)

| Path | Purpose |
|---|---|
| `/portal` | Overview: open cases with progress, latest updates |
| `/portal/cases`, `/portal/cases/new` | All cases; start a case |
| `/portal/cases/[ref]` | The case: status, details form, diagnosis, decisions, ledger, history, objectives, human support, evidence, reopen or feedback |
| `/portal/notifications`, `/portal/profile` | Updates; details, notification preferences, data-use notice |

### Operator console (`/app`, staff identity)

| Group | Path | Permission |
|---|---|---|
| Work | `/app` | any staff |
| Work | `/app/cases`, `/app/cases/[ref]`, `/app/approvals`, `/app/escalations` | `case.read` |
| Work | `/app/analytics` | `analytics.read` |
| Work | `/app/notifications` | any staff |
| Admin | `/app/admin` | `org.manage` |
| Admin | `/app/admin/members` | `members.manage` |
| Admin | `/app/admin/policies` | `policy.read` |
| Admin | `/app/admin/workflows` | `workflow.write` |
| Admin | `/app/admin/integrations` | `integrations.manage` |
| Admin | `/app/admin/api-keys` | `apikeys.manage` |
| Admin | `/app/admin/ledger`, `/app/admin/audit` | `audit.read` |
| Admin | `/app/admin/billing` | `billing.read` |

### HTTP API (`/api`)

`/api/health`, `/api/auth/[...all]`, `/api/evidence/[id]`, `/api/admin/export`, `/api/v1/egain/sessions`, `/api/v1/egain/cases/[ref]`, `.../actions/[actionId]/confirm`, `.../escalations`, `/api/v1/receipts/[no]/verify`. Contracts are in `api-and-workflow-contracts.md`.

## 3. Navigation

- **Public:** header Product, Solutions, Pricing, Security, About; theme toggle; Sign in; "Try the demo". The mobile menu adds Request access. Footer: Product, Company, Legal.
- **Portal:** Overview, Cases, Notifications (with unread count), Profile & privacy; theme toggle; Sign out. A mobile disclosure menu repeats the four links.
- **Console:** a left rail on large screens (a disclosure menu below the `lg` breakpoint) with two groups, Work and Admin, filtered by role. The header carries the command palette (`Ctrl/Cmd+K`), a notification bell with unread count, theme toggle and Sign out. The palette lists exactly the same items as the rail.

## 4. Navigation by role

Computed from `NAV` and `ROLE_PERMISSIONS`. "x" = item visible.

| Item | owner | admin | policy_manager | operator | approver | analyst |
|---|---|---|---|---|---|---|
| Command center, Notifications | x | x | x | x | x | x |
| Cases, Approvals, Escalations | x | x | x | x | x | x |
| Analytics | x | x | x | x | x | x |
| Organization, Members & invites, Integrations, API keys | x | x | | | | |
| Policies & knowledge | x | x | x | x | x | x |
| Workflows | x | x | x | | | |
| Outcome ledger, Audit log | x | x | | | | x |
| Plan & usage | x | x | | | | |

What each role can then do (selected): `operator` runs permitted actions, takes ownership of escalations and adds notes; `approver` decides approvals, approves policy, and holds `workflow.publish`; `policy_manager` writes policy and workflows but cannot approve them; `analyst` reads only; `admin` has everything except `billing.manage`; `owner` has everything.

**Finding:** the `approver` role holds `workflow.publish` but not `workflow.write`, and the Workflows page requires `workflow.write`. An approver therefore cannot open the page that offers Publish, although `/demo` describes the approver as approving workflow changes. The domain function allows it; the page does not. Not covered by a test.

**Customer access:** customers have no role. They see only their own cases. An operator-issued link (`/portal/access/[token]`) is read-only (scope `case:read`) and limited to one case in the case list, case page and evidence download; the domain refuses consent, confirmation, escalation, upload and cancellation from it (`tests/security/review-findings.test.ts`, F1 and F2). The portal interface still renders those buttons for link visitors, and `/portal/notifications` and `/portal/profile` still show the customer's data, including notification preferences, which a link visitor can still save. Read from the code; the route itself is not tested.

## 5. Handling of states across the structure

Not found: `loading.tsx`, `error.tsx` and `not-found.tsx` files. Unknown or forbidden cases call `notFound()` and show the framework default 404. Form errors are shown inline by `ActionForm`. Lists show `EmptyState`. Pages refresh themselves every 15 to 20 seconds while a case is active (`AutoRefresh`).
