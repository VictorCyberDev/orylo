# Screen inventory

**Status / what this describes:** Every route in `src/app` as of 2026-11-10, with audience, purpose, key components, the access rule enforced in code, the empty, error and loading states the code handles, and what the automated tests cover. Written from the code and `tests/e2e/`. Nothing here was checked with users or assistive technology.

**How to read the coverage column**

- **axe** = scanned by `a11y-responsive.spec.ts` with WCAG 2.0/2.1/2.2 A and AA tags; the test fails only on serious or critical findings. Public pages in light and dark; signed-in pages in the default (light) theme only. One scan per page in its initial state.
- **overflow** = no horizontal scroll at the listed widths (`scrollWidth - clientWidth <= 1`).
- **journey** = driven by a scripted flow (`journey.spec.ts`, `auth.spec.ts`, `egain-api.spec.ts`).
- "None" means no automated browser coverage.

**States.** The repository has no `loading.tsx`, `error.tsx` or `not-found.tsx`. There are no loading skeletons in use (a `Skeleton` component exists and is unused). Pages are server-rendered; a missing record calls `notFound()` and shows the framework's default 404. Form failures are shown inline by `ActionForm`. "Empty" below means an `EmptyState` or equivalent message exists.

## Public site

| Path | Purpose | Key components | Empty / error | Coverage |
|---|---|---|---|---|
| `/` | Positioning, interactive explainer, solution cards | `ResolutionExplorer`, `Badge`, `LinkButton` | Static | axe (both themes); overflow 375/820/1920; skip-link keyboard test; screenshots `home-mobile.png`, `home-tablet.png`, `home-large.png` |
| `/product` | The four-stage loop | `ResolutionExplorer`, `Card` | Static | axe; overflow; reduced-motion seal test |
| `/solutions` | Solution list with Working or Roadmap badges | `Card`, `Badge` | Static | axe |
| `/solutions/[slug]` | One solution; unknown slug is a 404 | `Badge`, `LinkButton` | `notFound()` | axe for `subscription-billing-recovery` only; overflow for `warranty-claim-readiness` only; the other three slugs: none |
| `/pricing` | Provisional pricing experiments | `Card`, `Alert`, `Badge` | Static | axe; overflow; mobile menu and target-size test |
| `/security`, `/about` | Controls that exist; company | `Alert`, `Card` | Static | axe |
| `/contact` | Request early access | `LeadForm`, `Field`, `Alert` | Per-field errors (`aria-invalid`), success `role=status`, honeypot, rate limit | axe; overflow; journey (validation and success) |
| `/demo` | Demo accounts and a five-minute path | `Card`, `LinkButton`, `SyntheticBadge` | Credentials appear only when `DEMO_MODE=true`; otherwise an info alert | axe; overflow (the scanned state depends on the environment's `DEMO_MODE`) |
| `/legal/privacy`, `/legal/terms` | Drafts marked "Needs legal review" | `Alert` | Static | axe |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image`, `/icon.svg` | Metadata | none | none | None |

## Account routes

| Path | Purpose | Key components | Empty / error | Coverage |
|---|---|---|---|---|
| `/sign-in` | One sign-in for customers and staff | `AuthShell`, `SignInForm` | Inline alert for bad credentials and rate limit. `?expired=1`, set by a failed case link, is not read, so no message explains the redirect. | axe; journey (wrong password, unsafe `next`, role landing) |
| `/forgot-password` | Request a reset link | `ForgotForm` | Same answer for any address; states that no email is sent | journey (`auth.spec.ts`); axe: none |
| `/reset-password` | Choose a new password | `ResetForm` | Missing token: danger alert. Invalid token: inline error | journey (`auth.spec.ts`); axe: none |
| `/invite/[token]` | Join an organization | `InviteSignUpForm`, `AcceptInviteForm` | Invalid, used or expired: danger alert; wrong signed-in account: alert | journey (invalid token only); axe: none |
| `/portal/access/[token]` | Route handler: sets a cookie for a read-only, one-case view and redirects to the case | none | Invalid or expired redirects to `/sign-in?expired=1` | None for the route; the read-only and case-scope rules are tested at domain level only (`tests/security/review-findings.test.ts`) |

## Customer portal (customer identity; signed-out visitors go to `/sign-in?next=/portal`)

| Path | Purpose | Key components | Empty / error | Coverage |
|---|---|---|---|---|
| `/portal` | Open cases with progress, latest updates | `Progress`, `StateBadge`, `EmptyState` | "Nothing open right now"; "No updates yet" | axe (light); overflow 375; journey (screenshot) |
| `/portal/cases` | All cases | `DataTable`, `StateBadge` | "No cases yet" | axe; overflow 375; journey |
| `/portal/cases/new` | Choose what happened | `NewCaseForm`, `Field`, `Alert` | Inline error; account hint falls back to empty list | axe; overflow 375; journey |
| `/portal/cases/[ref]` | The case (see below) | `StatusSummary`, `InfoForm`, `KnowledgePanel`, `ActionCards`, `ReceiptsAndLedger`, `Timeline`, `ObjectiveList`, `HumanSupport`, `EvidenceBox`, `ReopenOrFeedback`, `AutoRefresh` | Another customer's reference: 404 (tested). Ledger empty: "Nothing has been changed yet". Case-scoped link to another case: 404. | **axe: none.** overflow 375; journey (three tests) |
| `/portal/notifications` | In-app updates; mark all read | `Badge`, `EmptyState` | "Nothing yet" | axe; overflow 375 |
| `/portal/profile` | Details, notification preferences, data-use notice | `PrefsForm` | none | axe; overflow 375 |

The case page renders the same decision, upload and escalation controls for read-only link visitors; their submissions are refused with a message. Case page sections by condition: `InfoForm` only in `AWAITING_CUSTOMER_INFORMATION`; `ActionCards` only for requests awaiting consent, awaiting approval, approved or failed; feedback and reopen only in `VERIFIED_RESOLVED`; reopen only in `CANCELLED` or `FAILED`; "Cancel this case" in other states except `REOPENED`. Auto-refresh every 20 seconds while the case is not closed.

## Operator console (staff identity; signed-out or customer visitors go to `/sign-in?next=/app`; a role without the permission goes to `/app?denied=1`)

| Path | Permission | Purpose | Key components | Empty / error | Coverage |
|---|---|---|---|---|---|
| `/app` | any staff | Counts, needs-attention list, measured outcomes | `Stat` cards, `DataTable`, `AutoRefresh` | "All clear"; "Analytics not available for your role"; denied banner | axe; overflow 375/1280/1440; journey (screenshot) |
| `/app/cases` | `case.read` | Search, filter, sort, paginate | filter `form role=search`, `DataTable`, pagination `nav` | "No cases match" with Clear filters | axe; overflow 375/1280/1440; journey (`?q=Jordan`) |
| `/app/cases/[ref]` | `case.read` | The case, evidence first | `Recommendation`, `KnowledgePanel`, `ActionsTable`, `StaffOps`, `EscalationsBlock`, `OperatorLedger`, `Timeline`, `ObjectiveList`, `CaseControls`, `PortalLinkForm`, `EscalateButton` (modal) | Unknown reference: 404; "No actions proposed yet"; "No ledger entries yet" | **axe: none.** overflow 1280/1440; journey (record decision) |
| `/app/approvals` | `case.read` (deciding needs `approval.decide`) | Pending approvals | `DataTable`, `ActionForm` | "Nothing waiting"; "Your role can't decide approvals" | axe; overflow 1280/1440 |
| `/app/escalations` | `case.read` | Escalation queue (open or all) | `DataTable`, `Badge` | "No open escalations" | axe; overflow 1280/1440 |
| `/app/analytics` | `analytics.read` | Measured figures, labelled savings model | `DataTable`, `Progress` | "No data in range" | axe; overflow 1280/1440 |
| `/app/notifications` | any staff | Staff updates | `Badge` | "Nothing yet" | axe; overflow |
| `/app/admin` | `org.manage` | Name, branding, threshold, retention | `OrgForm` | Inline errors; branding needs an entitled plan | axe; overflow |
| `/app/admin/members` | `members.manage` | Roles, deactivate, invite | `InviteForm`, `DataTable` | Empty invitations message | axe; overflow |
| `/app/admin/policies` | `policy.read` | Versions, test question, gaps, drafts | `PolicyTester`, `PolicyDraftForm` | Contradiction alert; "None recorded" | axe; overflow |
| `/app/admin/workflows` | `workflow.write` | Versions and JSON editor | `WorkflowEditor` | Validation errors inline | axe; overflow |
| `/app/admin/integrations` | `integrations.manage` | Simulator mode | `SimModeForm`, `Alert` | Alert states what is and is not connected | axe; overflow |
| `/app/admin/api-keys` | `apikeys.manage` | Create (shown once) and revoke | `KeyForm`, `CopyButton` | "No keys yet" | axe; overflow; journey (create key) |
| `/app/admin/ledger` | `audit.read` | Latest 100 entries; chain re-verified on load | `Alert` (verified or broken), `DataTable` | "No entries yet" | axe; overflow |
| `/app/admin/audit` | `audit.read` | Filterable audit events | `DataTable` | No empty message | axe; overflow |
| `/app/admin/billing` | `billing.read` | Test-mode plan, usage, invoices | `PlanForm`, `Progress` | "No invoices yet." | axe; overflow |

## API routes

`/api/health`, `/api/auth/[...all]`, `/api/evidence/[id]` (session required), `/api/admin/export` (session required), `/api/v1/egain/sessions`, `/api/v1/egain/cases/[ref]`, `/api/v1/egain/cases/[ref]/actions/[actionId]/confirm`, `/api/v1/egain/cases/[ref]/escalations`, `/api/v1/receipts/[no]/verify`. See `api-and-workflow-contracts.md`. Coverage: `egain-api.spec.ts` (all but `/api/health` and `/api/auth`, which only the browser journeys exercise indirectly).

## Coverage gaps worth closing first

1. The two case-detail pages (customer and operator) are the most important screens and are not axe-scanned.
2. Signed-in pages are scanned in the light theme only.
3. Error, filled-in and dialog states are not scanned (one scan per page, initial state).
4. Console pages other than `/app` and `/app/cases` are not checked below 1280 px.
