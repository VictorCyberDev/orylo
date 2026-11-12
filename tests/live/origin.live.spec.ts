import { expect, test } from "@playwright/test";
import { AGENT_ID } from "./agent";

/**
 * Gate for the real-widget acceptance: does eGain admit the production origin?
 * Calls eGain's agent-details endpoint (the first request the official widget makes) with the CORS preflight a browser would send.
 * No browser interception, so this reflects eGain's actual allow-list. It FAILS until the owner adds the origin in eGain
 * (see egain/OWNER-ACTIONS.md step 1). The Playwright request API does not enforce CORS itself; the assertion is on the header a browser would require.
 */
const ORIGIN = process.env.LIVE_PUBLIC_URL ?? "https://orylo-demo.vercel.app";
const DETAILS = `https://api.ai.egain.cloud/core/aiservices/v4/aiagent/details/agent/${AGENT_ID}`;

test("eGain admits the production origin (CORS preflight returns it in Access-Control-Allow-Origin)", async ({
  request,
}) => {
  const r = await request.fetch(DETAILS, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const allow = r.headers()["access-control-allow-origin"];
  expect(
    allow,
    `eGain preflight for Origin ${ORIGIN} returned Access-Control-Allow-Origin: ${allow ?? "(absent)"}`,
  ).toBe(ORIGIN);
});

test("control: eGain's own origin is admitted (proves the check itself works)", async ({ request }) => {
  const r = await request.fetch(DETAILS, {
    method: "OPTIONS",
    headers: {
      Origin: "https://ai.egain.cloud",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  expect(r.headers()["access-control-allow-origin"]).toBe("https://ai.egain.cloud");
});
