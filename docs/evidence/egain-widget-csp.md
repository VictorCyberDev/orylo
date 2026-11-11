# eGain widget — what it actually does in a browser, and how Orylo's CSP accommodates it

Observed 2026-11-11 in Chromium (Playwright), loading the owner's official embed (agent `015f4f90-8772-4065-9e64-894b3615c5d3`,
server `https://ai.egain.cloud/r9iv`, loader `egain-chat.js` build `21.24.0-2-202610150841`). Nothing from eGain is stored in this repository.

## Findings that shaped the integration

1. **The official loader cannot run under a strict CSP as shipped.** It creates `iframe.src = "javascript:false"` and writes
   `<body onload="document._l();">` into it. Both inherit the page's CSP, so a `script-src` without `'unsafe-inline'` blocks them and the widget never starts.
   Observed: with Orylo's nonce CSP and no allowance, no launcher appears.
2. **Fix without `'unsafe-inline'`:** `script-src … 'unsafe-hashes' 'sha256-<document._l();>' 'sha256-<javascript:false>'`. Only those two exact snippets are allowed.
   Proven both ways: the widget starts with the hashes (`tests/live/widget.live.spec.ts`, real eGain) and **does not** start when they are removed
   (negative control in `tests/e2e/egain-widget.spec.ts`). A drift test fetches the live loader and fails if either snippet changes.
3. **Origins the widget needs** (everything else stays blocked): connect `ai.egain.cloud`, `api.ai.egain.cloud`, `cdn.aiagent.egain.cloud`;
   frame `ai.egain.cloud`; style `ai.egain.cloud`, `cdn.aiagent.egain.cloud`, `fonts.googleapis.com`; font `cdn.aiagent.egain.cloud`, `fonts.gstatic.com`;
   img `ai.egain.cloud`, `cdn.aiagent.egain.cloud`; media `cdn.aiagent.egain.cloud`. Scripts the loader adds are trusted through `'strict-dynamic'` (no host allow-list).
4. **Deliberately not allowed:** `clickstack.aiagent-dev.egain.cloud` — the widget posts telemetry to a *dev* host. Blocking it costs nothing visible (chat works) and keeps page/user data from going there.
5. **Harmless noise recorded:** an optional per-tenant `custom.js` hook from `apps.egain.services` returns a non-script response and is blocked by the browser (ORB). Not a CSP matter.
6. **CORRECTION (2026-11-11, later) — eGain admits only its own origin by default.** The details endpoint the widget calls first
   (`api.ai.egain.cloud/core/aiservices/v4/aiagent/details/agent/<id>`) answers the CORS preflight with `Access-Control-Allow-Origin` **only for
   `https://ai.egain.cloud`**; for every other origin (checked with curl: `https://orylo-demo.vercel.app`, `https://example.org`, `http://localhost:3000`) there is no
   Allow-Origin header, so a real browser blocks the call and the launcher never appears. The deployed site shows exactly this
   (`Access to fetch … has been blocked by CORS policy`, `launcher: 0`). The earlier statement here that "non-loopback origins work" was **wrong**: those
   tests used Playwright request interception, which does not enforce this CORS check (proven by loading the same deployed page with and without interception:
   with → launcher appears, without → blocked). **Consequence:** the widget can run on `https://orylo-demo.vercel.app` only after the owner adds that origin to the eGain
   agent's allowed domains / trusted origins (an eGain admin setting Orylo cannot reach). Until then `/demo` shows the unavailable state **and a link to eGain's own full-page chat**
   (`…/cc/web/index.html?agentid=…&platform=standalone&flavor=ss`, the same page the widget frames), which works in a real browser because it runs on eGain's own origin (verified:
   a policy question was answered with citations).
7. **CSP belongs to the document, not the route.** After a client-side navigation (e.g. sign-in → portal) the original page's CSP still applies. So the eGain allowances are present on every page except `/app/**` and `/api/**`; the script itself is only *loaded* on `/demo` and `/portal`. Operator/admin pages never carry the allowances.
8. **Theme:** the widget is not theme-aware (brand colour `#bb128f`, light surface in both Orylo themes). It stays legible in dark mode; it cannot be restyled from outside its iframe.
9. **Opening it from the page:** eGain exposes an undocumented `window.egainDockAi.launchChat()`. Orylo's "Open the eGain assistant" button uses it, verifies the window opened and retries (a click in the first moments after the launcher appears is otherwise ignored); the visible chat bubble always works as the fallback.

## Evidence

* Screenshots: `docs/evidence/screenshots/egain-demo-{desktop,mobile}-{closed,open}.png`
* Browser console/network capture: `docs/evidence/egain-live/widget-console-{desktop,mobile}.json` and `loader-version.json`
* Tests: `tests/unit/egain-config.test.ts`, `tests/e2e/egain-widget.spec.ts` (offline stand-in), `tests/live/widget.live.spec.ts` (real eGain)
