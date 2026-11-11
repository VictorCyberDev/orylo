import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EGAIN_LOADER_HASHES,
  cspAllowsEgain,
  egainCspAdditions,
  getEgainConfig,
  isTrustedEgainServerUrl,
  widgetRoute,
} from "@/config/egain";

const h = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

describe("eGain widget configuration (offline; the live loader is checked by tests/live)", () => {
  it("defaults are exactly the owner's published values", () => {
    const c = getEgainConfig({} as NodeJS.ProcessEnv);
    expect(c.enabled).toBe(true);
    expect(c.agentId).toBe("015f4f90-8772-4065-9e64-894b3615c5d3");
    expect(c.serverUrl).toBe("https://ai.egain.cloud/r9iv");
    expect(c.scriptUrl).toBe("https://ai.egain.cloud/r9iv/system/templates/chat/egain-chat.js");
    expect(c.origin).toBe("https://ai.egain.cloud");
    expect(c.standaloneUrl).toBe(
      "https://ai.egain.cloud/r9iv/system/web/apps/aiagent/cc/web/index.html?agentid=015f4f90-8772-4065-9e64-894b3615c5d3&platform=standalone&flavor=ss",
    );
  });
  it("refuses to load script from anything that is not an eGain https host", () => {
    for (const bad of [
      "http://ai.egain.cloud/r9iv",
      "https://evil.example/r9iv",
      "https://egain.cloud.evil.example/x",
      "javascript:alert(1)",
      "not a url",
    ])
      expect(isTrustedEgainServerUrl(bad), bad).toBe(false);
    const c = getEgainConfig({
      EGAIN_SERVER_URL: "https://evil.example/r9iv",
    } as unknown as NodeJS.ProcessEnv);
    expect(c.enabled).toBe(false);
    expect(c.scriptUrl).toBe("");
    expect(c.standaloneUrl).toBe("");
    expect(egainCspAdditions(c)).toBeNull();
  });
  it("rejects a malformed agent id and honours the kill switch", () => {
    expect(getEgainConfig({ EGAIN_AGENT_ID: "x" } as unknown as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(getEgainConfig({ EGAIN_WIDGET: "off" } as unknown as NodeJS.ProcessEnv).enabled).toBe(false);
  });
  it("only /demo and /portal host the widget; operator/admin and APIs never do, nor do their CSPs allow it", () => {
    for (const p of ["/demo", "/demo/x", "/portal", "/portal/cases/ORY-1001"])
      expect(widgetRoute(p), p).toBe(true);
    for (const p of ["/", "/app", "/app/admin", "/sign-in", "/product", "/demonstration", "/portalx"])
      expect(widgetRoute(p), p).toBe(false);
    for (const p of ["/app", "/app/admin/policies", "/api/health", "/api/v1/egain/sessions"])
      expect(cspAllowsEgain(p), p).toBe(false);
    for (const p of ["/", "/demo", "/sign-in", "/portal"]) expect(cspAllowsEgain(p), p).toBe(true);
  });
  it("the CSP additions are the minimum: exact origins, two exact hashes, no wildcard, no unsafe-inline", () => {
    const a = egainCspAdditions(getEgainConfig({} as NodeJS.ProcessEnv))!;
    expect(a.script).toEqual(["'unsafe-hashes'", h("document._l();"), h("javascript:false")]);
    expect([...EGAIN_LOADER_HASHES]).toEqual([h("document._l();"), h("javascript:false")]);
    const all = Object.values(a).flat().join(" ");
    expect(all).not.toContain("*");
    expect(all).not.toContain("'unsafe-inline'");
    expect(all).not.toContain("'unsafe-eval'");
    expect(a.connect).toEqual([
      "https://ai.egain.cloud",
      "https://api.ai.egain.cloud",
      "https://cdn.aiagent.egain.cloud",
    ]);
    expect(a.frame).toEqual(["https://ai.egain.cloud"]);
    expect(a.connect.join(" ")).not.toContain("dev"); // telemetry host deliberately not allowed
  });
});
