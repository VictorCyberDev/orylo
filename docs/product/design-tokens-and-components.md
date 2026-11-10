# Design tokens and component library

**Status / what this describes:** The design tokens in `src/app/globals.css` and the components in `src/components/` as of 2026-11-10, with accessibility behaviour read from the code. Contrast ratios in section 3 were computed by formula (WCAG 2.x relative luminance) from the documented hex values; they are not measurements of rendered pages. What axe checked automatically is stated separately. No design review, user testing or screen-reader testing has been done. Brand name "Orylo" is an uncleared working name; the five anchor colours are working choices.

## 1. Tokens

### Colour (defined on `:root`; dark values under `:root[data-theme="dark"]` and, when no explicit theme is set, `prefers-color-scheme: dark`)

Brand anchors, defined but not used as text colours: Midnight `#111e2c`, Mint `#a2eedb`, Cloud `#f7f8f6`, Amber `#d9a64b`, Coral `#d46d65`. Status and text tokens are darkened or lightened variants.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f7f8f6` | `#0c1620` | Page |
| `--surface` / `-2` / `-3` | `#fff` / `#eff2ee` / `#e5e9e4` | `#111e2c` / `#172838` / `#1f3346` | Cards; hover and table-head; skeleton |
| `--fg` | `#111e2c` | `#f2f5f2` | Body text |
| `--fg-muted` | `#4a5866` | `#b3c0cb` | Captions, descriptions |
| `--fg-subtle` | `#6a7784` | `#8fa0ae` | Placeholder, hashes |
| `--border` / `--border-strong` | `#d9dfd8` / `#b9c3bb` | `#25384a` / `#38526a` | Dividers; control borders |
| `--focus` | `#0b6b57` | `#a2eedb` | Focus ring |
| `--primary` / `-fg` / `-hover` | `#111e2c` / `#f7f8f6` / `#1d3043` | `#a2eedb` / `#0a2a22` / `#bff5e7` | Primary button |
| `--accent` / `-fg` / `-text` | `#a2eedb` / `#0a2a22` / `#0b6b57` | `#a2eedb` / `#0a2a22` / `#a2eedb` | Accent button; accent text |
| `--active`, `--selection` | `#e3f6f0`, `#cfeee5` | `#16352f`, `#1d4a44` | Selected tint; text selection |
| `--success` / `-bg` | `#17694f` / `#e2f5ee` | `#6fe0b9` / `#123a30` | Verified |
| `--warning` / `-bg` | `#7a5200` / `#fbf0d9` | `#f0c470` / `#3a2c0d` | Waiting |
| `--danger` / `-bg` | `#a3342b` / `#fbe7e4` | `#f29a92` / `#3d1a17` | Failed, blocked |
| `--info` / `-bg` | `#26567f` / `#e5eef7` | `#8bbbe8` / `#14293d` | In progress |
| `--disabled-bg` / `-fg` | `#e9ede8` / `#7b8791` | `#182736` / `#6f8190` | Disabled controls |
| `--chart-1…5` | `#17694f #26567f #b07a12 #a3342b #6a4f9c` | `#6fe0b9 #8bbbe8 #f0c470 #f29a92 #c0a8f0` | Only `--chart-1` is used (one bar) |

Tailwind utilities map to these through `@theme inline` (`bg-surface`, `text-muted`, `border-border-strong`, and so on). The theme is chosen by an inline script that reads `localStorage["orylo-theme"]` before paint; `ThemeToggle` writes it, inside try/catch.

### Typography

Geist Sans and Geist Mono. Body 15 px, line height 1.55.

| Class | Size / weight | Use |
|---|---|---|
| `t-display` | clamp 2.4–4 rem, 600 | Marketing hero |
| `t-h1` | clamp 1.75–2.4 rem, 600 | Page title (`PageHeader`) |
| `t-h2` | 1.375 rem, 600 | Section, dialog title |
| `t-h3` | 1.0625 rem, 600 | Card title |
| `t-body-lg` | 1.125 rem, muted | Lead paragraph |
| `t-caption` | 0.8125 rem, muted | Hints, metadata |
| `t-label` | 0.75 rem, uppercase, tracked, 600 | Table heads, eyebrows |
| `t-num`, `t-code` | tabular figures; mono 0.8125 rem | Numbers; references, hashes |

### Space, shape, elevation, layout

Spacing is Tailwind's default scale; no custom spacing tokens. Radius: `--radius-sm` 6 px, `-md` 10 px, `-lg` 16 px. Shadow: `--shadow-sm`, `-md`, `-lg` (heavier in dark). Breakpoints are Tailwind defaults. Content widths: marketing `max-w-6xl`, portal `max-w-5xl`, console `88rem` with a 15 rem rail from `lg`. Interactive minimum heights: buttons 36 px (`sm`), 44 px (`md`), 48 px (`lg`); inputs 44 px; the nav and tab items 40 to 48 px.

### Focus, motion, reduced motion

Focus: `:focus-visible` gives a 2 px outline in `--focus`, offset 2 px, on links, buttons, fields, summaries and `[tabindex]`. A skip link is the first focusable element.

Motion: `fade-up` (280 ms, toasts), `shimmer` (skeleton, unused in pages), and the Verified seal. Under `prefers-reduced-motion: reduce` every animation and transition is cut to 0.01 ms and the seal's strokes are set to fully drawn. Tested: `a11y-responsive.spec.ts`, "verified seal is drawn statically…".

### Signature element: the Verified seal

`VerifiedSeal` is a 44 px SVG (circle, a ring that draws in 700 ms, and a check mark that draws in 520 ms after a 120 ms delay). Rule in the code: it is rendered only when the backend returned verification evidence (a ledger entry whose outcome is `VERIFIED` and which has `verifiedAt`; the explorer on `/product` shows it as an illustration and labels it so). It has `role="img"` and an `aria-label` ("Verified" by default).

## 2. Component reference

### `src/components/ui.tsx` (server-safe)

| Component | Props (summary) | Accessibility | Used in |
|---|---|---|---|
| `Button`, `LinkButton`, `buttonClass` | `variant` primary, secondary, ghost, danger, accent; `size` sm, md, lg | Native `button` (default `type="button"`) or Next `Link`; disabled styling uses tokens | everywhere |
| `inputClass` | class string | Invalid state styles on `aria-invalid="true"`; placeholder uses `--fg-subtle` | all forms |
| `Field` | `id`, `label`, `hint`, `error`, `required` | `label for`; required adds a visible `*` (hidden from readers) plus "(required)" for readers; error is `role="alert"`. It renders ids `${id}-hint` and `${id}-error` but does not set `aria-describedby` on the control; only `LeadForm` wires the error id. | all forms |
| `Badge`, `StateBadge`, `SyntheticBadge`, `objectiveTone`, `objectiveLabel` | `tone` neutral, success, warning, danger, info, accent | Always carries text; meaning is never colour alone | lists, headers |
| `Card`, `CardHeader`, `PageHeader` | title, description, action, eyebrow | `CardHeader` renders `h2`; `PageHeader` renders the page `h1`; cards use `aria-labelledby` | all pages |
| `Alert` | `tone`, `title` | `role="alert"` for danger, `role="status"` otherwise | forms, panels |
| `EmptyState` | `title`, `action` | Decorative ring is `aria-hidden` | lists |
| `Progress` | `value`, `max`, `label` | `role="progressbar"` with min, max, now and label | portal, billing |
| `Skeleton` | `className` | `aria-hidden` | not used in any page |
| `DataTable`, `Th`, `Td` | `caption` | Horizontally scrollable region with `tabIndex=0`, `role="region"` and a label; screen-reader caption; `th scope="col"`; minimum width 640 px | all tables |
| `VerifiedSeal` | `label` | `role="img"` with label | ledgers, status |
| `Money`, `When` | cents; date | `Money` formats USD; `When` renders `<time dateTime>` in UTC | tables, timelines |

### `src/components/client.tsx` (client)

| Component | Behaviour | Accessibility |
|---|---|---|
| `ThemeToggle` | Flips light and dark; persists in `localStorage` (try/catch) | Label states the action ("Switch to dark theme") |
| `ToastProvider`, `useToast` | Six-second toasts for success messages | Polite live region; items are `role="status"` or `alert`; labelled dismiss button |
| `ActionForm`, `SubmitButton` | Submits server actions in a transition so a failed submit keeps what was typed; resets on success; follows `redirectTo`; shows errors in a danger `Alert`; `noValidate` | Pending state sets `disabled` and `aria-disabled` and swaps the label; the swap is not announced |
| `Modal` | Radix Dialog | Focus trap, Escape, focus return, required title, description or hidden fallback; labelled close button |
| `Tabs*`, `Tip` | Radix Tabs and Tooltip | Library semantics; both exported and unused in pages |
| `CopyButton` | Copies to the clipboard, shows "Copied" for 1.8 s | Text label; failure is silent |
| `CommandPalette` | `Ctrl/Cmd+K`; filters pages the role may open | Dialog; input `role="combobox"` with `aria-activedescendant`; `listbox` of `option`s; arrows, Enter, Escape; `aria-keyshortcuts` |
| `MobileNav` | Disclosure panel below `md` | `aria-expanded`, `aria-controls`, labelled; closes when a link is clicked; no Escape handler |
| `AutoRefresh` | Calls `router.refresh()` every 15 to 20 s while the tab is visible | No visible control to pause it |

### Domain components

| Component | Purpose and key props | Notable accessibility behaviour | Used in |
|---|---|---|---|
| `StatusSummary({view})` | One sentence for the current state, with a seal for verified | Alert with the state label as title | portal case |
| `ObjectiveList` | Per-objective badges and a progress bar ("n of m verified") | Text status; progressbar | both case pages |
| `KnowledgePanel({view, audience})` | Diagnosis facts; "What we don't know" for customers | Description list | both |
| `ActionCards({view, caseRef})` | Consent wording in a quotation block; Yes and No forms; approval and failure notices | Region labelled by action name | portal |
| `ReceiptsAndLedger` | Customer ledger, seal only for verified entries | Ordered list | portal |
| `Timeline({view, audience})` | Newest-first history; internal events badged for staff | Ordered list; times in `<time>` | both |
| `HumanSupport` | Callback and email forms; open requests | Each form labelled | portal |
| `InfoForm`, `EvidenceBox`, `ReopenOrFeedback` | Missing details; upload (PNG, JPEG, PDF, text, 2 MB each; 10 files or 10 MB per case); reopen, feedback, cancel | Field labels; native file input | portal |
| `Recommendation`, `ActionsTable`, `OperatorLedger`, `CaseControls`, `StaffOps`, `EscalationsBlock`, `EscalateButton` | Reasoned recommendation first; typed actions; hash-chained ledger with raw evidence in `details`; transitions legal for staff; escalation ownership; modal escalation | Table region; Approve and Decline are buttons with `min-h-9` | operator case |
| `ResolutionExplorer` | Four-stage tabbed explainer with an illustrative seal | `tablist`, `tab`, `tabpanel`, roving `tabindex`, Left and Right arrows; focus does not follow the selection and Home and End are unsupported | `/`, `/product` |
| `LeadForm`, `NewCaseForm`, `PortalLinkForm`, `PrefsForm`, auth forms, `AuthShell`, admin forms | Form wrappers over `ActionForm` | Labels; autocomplete attributes on auth fields; honeypot hidden from readers and the tab order | their routes |
| `navFor`, `commandsFor` | Role-filtered navigation | Same list feeds rail, mobile menu, palette | console |

## 3. Contrast

**Computed by formula** (WCAG 2.x relative luminance, hex values above; throwaway script, not in the repository). Thresholds: 4.5 for normal text, 3 for UI boundaries and focus indicators.

| Pair | Light | Dark | Used for |
|---|---|---|---|
| `fg` on `bg` | 15.82 | 16.61 | Body |
| `fg-muted` on `surface` | 7.29 | 9.08 | Captions |
| `fg-muted` on `surface-2` | 6.46 | 8.10 | Table heads |
| `fg-subtle` on `surface` | 4.58 | 6.27 | Placeholder, hashes |
| `fg-subtle` on `bg` | **4.30** | 6.78 | Not used on `bg` in current code |
| `primary-fg` on `primary` | 15.82 | 11.55 | Primary button |
| `accent-fg` on `accent` | 11.55 | 11.55 | Accent button |
| `accent-text` on `surface` | 6.45 | 12.67 | Links, active tab |
| `success` on `success-bg` | 5.85 | 7.79 | Verified badge |
| `warning` on `warning-bg` | 6.12 | 8.30 | Waiting badge |
| `danger` on `danger-bg` | 5.73 | 7.22 | Failed badge, danger button |
| `info` on `info-bg` | 6.58 | 7.33 | Info badge |
| `danger` on `surface` | 6.81 | 7.88 | Field error |
| `focus` on `bg` | 6.06 | 13.71 | Focus ring (needs 3) |
| `disabled-fg` on `disabled-bg` | 3.10 | 3.78 | Disabled; exempt from 1.4.3 |
| **`border-strong` on `surface`** | **1.81** | **2.07** | Input, select and secondary-button borders (needs 3 for 1.4.11 if the border is the only cue) |

The last row is a probable gap in WCAG 1.4.11 (non-text contrast) in both themes. It is a formula result, not a finding from a tool or a person; whether it fails depends on how the criterion is applied to labelled fields, and it needs a manual decision.

**Automatically tested:** axe's `color-contrast` rule, as part of the WCAG A and AA tag set, in `a11y-responsive.spec.ts`. Public pages in light and dark; the portal list pages and 15 console pages in light only. Only serious and critical results fail the test, and axe reports elements whose background it cannot compute as "incomplete", which the test does not inspect. The customer and operator case-detail pages, hover and selected states, the sticky translucent header, and every dialog state were not scanned.

**Not measured by me:** rendered contrast in any browser; alpha-blended borders (`border-success/30` and similar); the seal ring at 45 % opacity (decorative); anything outside the documented tokens.
