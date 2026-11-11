import { test as base, expect, type BrowserContext } from "@playwright/test";

export * from "@playwright/test";
export { expect };

/**
 * eGain's real host is stood in for by EVERY offline browser test. Reasons: (1) the offline suite must be deterministic
 * and never depend on a third party; (2) the real widget cannot even load from a loopback origin (eGain's API rejects
 * `localhost`/`127.0.0.1` by CORS — observed 2026-11-11), so the real thing is tested separately in tests/live.
 * The stand-in reproduces the two inline patterns of the real loader so Orylo's real CSP is exercised for real.
 */
export const EGAIN_SERVER = "https://ai.egain.cloud/r9iv";
export const EGAIN_SCRIPT = `${EGAIN_SERVER}/system/templates/chat/egain-chat.js`;
export const STAND_IN = `
!function(){
  var s = document.currentScript || document.getElementById("_egainallowdockchat");
  var f = document.createElement("iframe");
  f.src = "javascript:false"; f.title = "Chat"; f.style.cssText = "width:0;height:0;border:0";
  document.head.appendChild(f);
  var doc = f.contentWindow.document;
  doc.open()._l = function () {
    var p = window.parent;
    p.egainDockAi = { agentId: s && s.dataset.agentId, serverURL: s && s.dataset.serverUrl, launchChat: function () { p.document.documentElement.setAttribute("data-standin-chat", "open"); } };
    var l = p.document.createElement("iframe");
    l.id = "egain-chat-floating-launch-button-frame"; l.title = "Launch chat";
    l.style.cssText = "position:fixed;right:0;bottom:0;width:72px;height:72px;border:0;z-index:2147483000";
    p.document.body.appendChild(l);
  };
  doc.write('<body onload="document._l();">'); doc.close();
}();`;

const HOSTS = /^https:\/\/(ai\.egain\.cloud|api\.ai\.egain\.cloud|cdn\.aiagent\.egain\.cloud)\//;
const standInRoute: Parameters<BrowserContext["route"]>[1] = (r) =>
  r.request().url() === EGAIN_SCRIPT
    ? r.fulfill({ status: 200, contentType: "application/javascript", body: STAND_IN })
    : r.fulfill({ status: 404, body: "" });

export const test = base.extend({
  context: async ({ context }, run) => {
    await context.route(HOSTS, standInRoute);
    await run(context);
  },
  // Tests that open extra browser contexts (second user, second device) get the same stand-in.
  browser: async ({ browser }, run) => {
    const original = browser.newContext.bind(browser);
    browser.newContext = async (options) => {
      const c = await original(options);
      await c.route(HOSTS, standInRoute);
      return c;
    };
    await run(browser);
    browser.newContext = original;
  },
});
