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
6. **The widget does not start on loopback origins.** From `http://localhost:3000` or `http://127.0.0.1:3000`, eGain's API rejects the preflight (CORS) and the launcher never appears;
   non-loopback origins (including with ports) work. Consequence: the real widget cannot be demonstrated from `localhost`; it must be tested on a real hostname. `tests/live` serves the local app under `https://orylo-live.example` by request interception, with Orylo's own headers untouched.
7. **CSP belongs to the document, not the route.** After a client-side navigation (e.g. sign-in → portal) the original page's CSP still applies. So the eGain allowances are present on every page except `/app/**` and `/api/**`; the script itself is only *loaded* on `/demo` and `/portal`. Operator/admin pages never carry the allowances.
8. **Theme:** the widget is not theme-aware (brand colour `#bb128f`, light surface in both Orylo themes). It stays legible in dark mode; it cannot be restyled from outside its iframe.
9. **Opening it from the page:** eGain exposes an undocumented `window.egainDockAi.launchChat()`. Orylo's "Open the eGain assistant" button uses it, verifies the window opened and retries (a click in the first moments after the launcher appears is otherwise ignored); the visible chat bubble always works as the fallback.

## Evidence

* Screenshots: `docs/evidence/screenshots/egain-demo-{desktop,mobile}-{closed,open}.png`
* Browser console/network capture: `docs/evidence/egain-live/widget-console-{desktop,mobile}.json` and `loader-version.json`
* Tests: `tests/unit/egain-config.test.ts`, `tests/e2e/egain-widget.spec.ts` (offline stand-in), `tests/live/widget.live.spec.ts` (real eGain)
