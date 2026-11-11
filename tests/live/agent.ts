import type { Page } from "@playwright/test";

/** The owner's published widget values (public configuration, not credentials). */
export const AGENT_ID = "015f4f90-8772-4065-9e64-894b3615c5d3";
export const SERVER_URL = "https://ai.egain.cloud/r9iv";

/**
 * Opens the REAL agent on a minimal host page that carries the official embed snippet. Used for knowledge tests so
 * they test eGain's agent itself, independent of Orylo's pages (the widget-in-Orylo test is widget-live.spec.ts).
 */
export async function openRealAgent(page: Page) {
  await page.route("http://agent-host.test/", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body><h1>host</h1><script id="_egainallowdockchat" src="${SERVER_URL}/system/templates/chat/egain-chat.js" data-agent-id="${AGENT_ID}" data-server-url="${SERVER_URL}"></script></body></html>`,
    }),
  );
  await page.goto("http://agent-host.test/");
  await page.waitForFunction(() => typeof window.egainDockAi?.launchChat === "function", null, {
    timeout: 30_000,
  });
  await page.waitForSelector("#egain-chat-floating-launch-button-frame", {
    state: "attached",
    timeout: 30_000,
  });
  const chat = page.frameLocator("iframe#egain-chat-iframe");
  const box = chat.locator("textarea, input[type=text], [contenteditable=true]").first();
  // eGain's anonymous-session start is occasionally slow; retry the launch instead of failing the test on a cold start.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => window.egainDockAi!.launchChat!());
    if (
      await box.waitFor({ timeout: 20_000 }).then(
        () => true,
        () => false,
      )
    )
      break;
    if (attempt === 2) throw new Error("eGain chat window never produced an input box (3 launch attempts)");
  }
  // wait for the agent's greeting so later replies are never confused with it
  await chat.locator('.eg-message-bubble[aria-label^="Orylo said"]').first().waitFor({ timeout: 30_000 });
  return { chat, box };
}

export interface Reply {
  question: string;
  reply: string;
  allAgentBubbles: string[];
  ms: number;
}

/** Sends one message and returns the agent's NEW reply text (waits for it to stop changing). */
export async function ask(
  page: Page,
  session: Awaited<ReturnType<typeof openRealAgent>>,
  question: string,
): Promise<Reply> {
  const { chat, box } = session;
  const bubbles = () => chat.locator('.eg-message-bubble[aria-label^="Orylo said"]');
  const before = await bubbles().count();
  const t0 = Date.now();
  await box.fill(question);
  await box.press("Enter");
  let last = "";
  let stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await page.waitForTimeout(1500);
    const n = await bubbles().count();
    const txt =
      n > before
        ? ((await bubbles()
            .nth(n - 1)
            .getAttribute("aria-label")) ?? "")
        : "";
    if (txt && txt === last) stable++;
    else stable = 0;
    last = txt;
  }
  const all = await bubbles().evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return {
    question,
    reply: last.replace(/^Orylo said\s*/, "").trim(),
    allAgentBubbles: all.map((a) => a.replace(/^Orylo said\s*/, "").trim()),
    ms: Date.now() - t0,
  };
}

declare global {
  interface Window {
    egainDockAi?: { launchChat?: () => void };
  }
}
