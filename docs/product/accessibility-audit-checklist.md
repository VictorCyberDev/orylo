# Accessibility audit checklist (WCAG 2.2 AA)

**Status / what this describes:** A checklist of the WCAG 2.2 Level A and AA success criteria against what the repository actually tests on 2026-11-10. The target is conformance with WCAG 2.2 AA. **No conformance is claimed.** This is not an audit report.

**What has and has not been done**

- Automated: axe-core (`@axe-core/playwright`) with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, in `tests/e2e/a11y-responsive.spec.ts`; plus custom Playwright checks (skip link, command palette, overflow, 24 px targets, reduced motion) and form-error assertions in `journey.spec.ts` and `auth.spec.ts`.
- Automated tools catch only a subset of barriers. The axe test fails only on **serious or critical** results, scans each page once in its initial state, and does not inspect axe's "incomplete" results.
- **No screen-reader testing** (NVDA, VoiceOver, JAWS, TalkBack) has been done.
- **No usability testing with disabled people** has been done (`usability-research-plan.md` is a plan only).
- Not scanned by axe: the customer and operator case-detail pages, `/forgot-password`, `/reset-password`, `/invite/[token]`, four of five solution pages, any error, dialog or filled-form state, and signed-in pages in the dark theme.
- Browser: desktop Chromium only.

**Status values:** `Automated (axe) pass` = no serious or critical axe violation on the pages scanned, not proof of conformance. `Automated (custom Playwright) pass` = a named test asserts it for the pages it visits. `Manual check needed` = plausible from the code, nobody has checked. `Not tested`.

## 1. Perceivable

| SC | Level | Status | Test or note |
|---|---|---|---|
| 1.1.1 Non-text content | A | Automated (axe) pass | Image and SVG rules. Seals use `role="img"` with labels; icons are `aria-hidden`. Quality of the text alternatives: Manual check needed. |
| 1.2.1 to 1.2.5 Time-based media | A, AA | Not tested | Not applicable: no audio, video or iframe in `src`. |
| 1.3.1 Info and relationships | A | Manual check needed | axe structure rules (labels, lists, table headers) pass on scanned pages. Known gap: `Field` hints and errors have ids but are not linked with `aria-describedby` except in `LeadForm`. Heading order is not checked (axe best-practice rules are not in the tag set). |
| 1.3.2 Meaningful sequence | A | Manual check needed | |
| 1.3.3 Sensory characteristics | A | Manual check needed | Copy guide forbids colour-only meaning; badges carry text. |
| 1.3.4 Orientation | AA | Manual check needed | No orientation lock found in the code. |
| 1.3.5 Identify input purpose | AA | Automated (axe) pass | `autocomplete-valid` on scanned pages; auth and lead fields set `autocomplete`. |
| 1.4.1 Use of colour | A | Manual check needed | axe `link-in-text-block` passes where scanned. |
| 1.4.3 Contrast (minimum) | AA | Automated (axe) pass | Public pages, light and dark; portal list pages and 15 console pages, light only. Formula results in `design-tokens-and-components.md`. Case-detail pages and dark signed-in pages: Not tested. |
| 1.4.4 Resize text | AA | Manual check needed | `meta-viewport` passes; 200 % zoom not tested. |
| 1.4.5 Images of text | AA | Not tested | None found in the code. |
| 1.4.10 Reflow | AA | Manual check needed | Custom Playwright checks no horizontal overflow at 375, 820, 1280, 1440 and 1920 px for the pages listed in `screen-inventory.md`. 320 px and 400 % zoom are not tested. |
| 1.4.11 Non-text contrast | AA | Manual check needed | axe has no rule for this. By formula, control borders (`--border-strong`) are 1.81:1 (light) and 2.07:1 (dark) on `--surface`. Probable gap. |
| 1.4.12 Text spacing | AA | Not tested | |
| 1.4.13 Content on hover or focus | AA | Not tested | The tooltip component is unused; `title` attributes exist on timestamps and hashes. |

## 2. Operable

| SC | Level | Status | Test or note |
|---|---|---|---|
| 2.1.1 Keyboard | A | Manual check needed | Custom tests cover the skip link and the command palette only. axe `scrollable-region-focusable` passes (tables are focusable regions). Radio cards, modals, upload and approval flows are untested. |
| 2.1.2 No keyboard trap | A | Automated (custom Playwright) pass | Command palette closes on Escape. The test title also mentions a dialog focus trap and return, but the body asserts only the skip link; the escalation modal is untested. |
| 2.1.4 Character key shortcuts | A | Not tested | Only a modifier shortcut (Ctrl or Cmd + K) exists. |
| 2.2.1 Timing adjustable | A | Manual check needed | Toasts last 6 s (status only); sessions 7 days; case links 24 h. |
| 2.2.2 Pause, stop, hide | A | Manual check needed | Case and dashboard pages auto-refresh every 15 to 20 s with no way to pause. |
| 2.3.1 Three flashes | A | Not tested | No flashing content found. |
| 2.4.1 Bypass blocks | A | Automated (custom Playwright) pass | Skip link is the first tab stop and becomes visible (home page only). |
| 2.4.2 Page titled | A | Automated (axe) pass | `document-title`; every route sets metadata. |
| 2.4.3 Focus order | A | Manual check needed | |
| 2.4.4 Link purpose (in context) | A | Automated (axe) pass | `link-name` only; purpose in context is manual. |
| 2.4.5 Multiple ways | AA | Manual check needed | Navigation, sitemap and palette exist. |
| 2.4.6 Headings and labels | AA | Manual check needed | |
| 2.4.7 Focus visible | AA | Manual check needed | Global 2 px outline defined; no test asserts it. |
| 2.4.11 Focus not obscured (minimum) | AA | Not tested | Sticky headers on marketing and console; no `scroll-padding` set. |
| 2.5.1 Pointer gestures | A | Not tested | No multipoint or path gestures found. |
| 2.5.2 Pointer cancellation | A | Not tested | |
| 2.5.3 Label in name | A | Manual check needed | |
| 2.5.4 Motion actuation | A | Not tested | No motion input. |
| 2.5.7 Dragging movements | AA | Not tested | No drag handlers found. |
| 2.5.8 Target size (minimum) | AA | Automated (axe) pass | axe `target-size` on scanned pages; custom test finds no control under 24 px on `/pricing` at 375 px. Approve and Decline buttons are 36 px by CSS. Other pages at 375 px are untested. |

## 3. Understandable

| SC | Level | Status | Test or note |
|---|---|---|---|
| 3.1.1 Language of page | A | Automated (axe) pass | `<html lang="en">`. |
| 3.1.2 Language of parts | AA | Automated (axe) pass | English only; `valid-lang`. |
| 3.2.1 On focus | A | Manual check needed | |
| 3.2.2 On input | A | Manual check needed | Case filters need "Apply filters"; nothing auto-submits in the code read. |
| 3.2.3 Consistent navigation | AA | Manual check needed | |
| 3.2.4 Consistent identification | AA | Manual check needed | |
| 3.2.6 Consistent help | A | Manual check needed | "Talk to a person" appears on case pages only. |
| 3.3.1 Error identification | A | Automated (custom Playwright) pass | Lead form, sign-in and reset errors are asserted as `role="alert"` text. Other forms: Manual check needed (info-form errors are one generic alert, not per field). |
| 3.3.2 Labels or instructions | A | Automated (axe) pass | `label` rules on scanned pages. |
| 3.3.3 Error suggestion | AA | Manual check needed | |
| 3.3.4 Error prevention | AA | Manual check needed | Consent step stores wording; decline is possible. Whether users can review before submitting is untested. |
| 3.3.7 Redundant entry | A | Manual check needed | The product aims to avoid re-asking, untested with users. |
| 3.3.8 Accessible authentication (minimum) | AA | Manual check needed | Password and email fields with autocomplete; no cognitive test or CAPTCHA found. Paste is not blocked in the code read. |

## 4. Robust

| SC | Level | Status | Test or note |
|---|---|---|---|
| 4.1.2 Name, role, value | A | Automated (axe) pass | ARIA and name rules on scanned pages. Custom widgets (explorer tabs, combobox palette, Radix dialogs) need screen-reader checks. The explorer's arrow keys do not move focus to the selected tab. |
| 4.1.3 Status messages | AA | Automated (custom Playwright) pass | Tests find `role="status"` and `role="alert"` for lead success, toasts and form errors. Whether assistive technology announces them is untested. |

WCAG 2.2 removed 4.1.1 Parsing, so it is not listed.

## 5. Suggested order of work

1. Add the two case-detail pages, `/forgot-password`, `/reset-password` and signed-in dark mode to the axe scan.
2. Decide on control-border contrast (1.4.11).
3. Wire `aria-describedby` from `Field` to its control; show info-form errors per field.
4. Add a pause control or longer interval for auto-refresh.
5. Run keyboard-only and screen-reader walkthroughs of journeys 1, 3, 6 and 9 (`user-journeys.md`), then sessions with disabled participants per `usability-research-plan.md`.
