/**
 * Records the one-minute demonstration from REAL, unedited screen captures (Chrome screencast frames of real browser sessions) of
 *   (1) eGain's own public agent page answering a customer's complaint from the Northfield policy documents, and
 *   (2) Orylo's deployed site (a SEPARATE system) executing the governed correction, verifying it, and keeping the billing review pending.
 * Title cards are plain text labels; nothing is composited into the footage. Waiting time is not cut out of a clip — clips are only
 * joined. The eGain agent does NOT call Orylo yet; the cards say so.
 *
 * Usage: LIVE_PUBLIC_URL=https://orylo-demo.vercel.app REVIEWER_CODE=... node scripts/record-demo-video.mjs <outDir>
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const BASE = process.env.LIVE_PUBLIC_URL;
const CODE = process.env.REVIEWER_CODE;
const OUT = process.argv[2] ?? "docs/evidence/video";
const AGENT =
  "https://ai.egain.cloud/r9iv/system/web/apps/aiagent/cc/web/index.html?agentid=015f4f90-8772-4065-9e64-894b3615c5d3&platform=standalone&flavor=ss";
if (!BASE || !CODE) throw new Error("set LIVE_PUBLIC_URL and REVIEWER_CODE");
const W = 1280,
  H = 720;
const tmp = `${OUT}/_clips`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const exe = process.env.PW_CHROMIUM_PATH;
const browser = await chromium.launch(
  exe ? { executablePath: exe, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] },
);

// Not recorded: reviewer sign-in, so the shared password is never on screen. Only the resulting session is reused.
const setup = await browser.newContext({ viewport: { width: W, height: H } });
const sp = await setup.newPage();
await sp.goto(`${BASE}/demo`);
await sp.getByLabel("Reviewer code").fill(CODE);
await sp.getByRole("button", { name: "Show reviewer sign-in details" }).click();
const pw = (await sp.locator("span.t-code").first().textContent()).trim();
await sp.goto(`${BASE}/sign-in`);
await sp.getByLabel(/^Email/).fill("jordan.reyes@customer.example");
await sp.getByLabel(/^Password/).fill(pw);
await sp.getByRole("button", { name: "Sign in" }).click();
await sp.waitForURL(/\/portal$/, { timeout: 30000 });
const state = await setup.storageState();
await setup.close();

/**
 * Real screen capture: Chrome's own screencast frames (what the page actually painted, with their real timestamps), written
 * as-is and encoded by ffmpeg. (Playwright's recordVideo wrote no file in this environment, so it is not used.)
 */
async function record(name, fn, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...opts });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const dir = `${tmp}/${name}`;
  mkdirSync(dir, { recursive: true });
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    const file = `${dir}/f${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 85,
    maxWidth: W,
    maxHeight: H,
    everyNthFrame: 1,
  });
  await fn(page);
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send("Page.stopScreencast");
  await ctx.close();
  if (frames.length < 2) throw new Error(`clip ${name}: no frames captured`);
  const lines = [];
  frames.forEach((f, i) => {
    const d = i < frames.length - 1 ? Math.max(0.01, frames[i + 1].t - f.t) : 0.5;
    lines.push(`file '${f.file.replace(`${tmp}/`, "")}'`, `duration ${d.toFixed(3)}`);
  });
  lines.push(`file '${frames.at(-1).file.replace(`${tmp}/`, "")}'`);
  writeFileSync(`${tmp}/${name}.txt`, lines.join("\n"));
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      `${tmp}/${name}.txt`,
      "-vf",
      `scale=${W}:${H},fps=25`,
      "-c:v",
      "libvpx",
      "-b:v",
      "2M",
      "-an",
      `${tmp}/${name}.webm`,
    ],
    { stdio: "ignore" },
  );
  console.log(`clip ${name}: ${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)} s`);
}

// Clip A — eGain's real agent answers from the policy (real wait included)
await record("a_egain", async (p) => {
  await p.goto(AGENT);
  const box = p.locator("#eg-chat-message-input-textarea:enabled");
  await box.waitFor({ timeout: 45000 });
  await p.waitForTimeout(1500);
  await p
    .locator("#eg-chat-message-input-textarea")
    .pressSequentially(
      "I asked to cancel my subscription last week but I was charged again. What is your policy?",
      {
        delay: 28,
      },
    );
  await p.keyboard.press("Enter");
  await p.getByText("Sources").first().waitFor({ timeout: 60000 });
  await p.waitForTimeout(3500);
});

// Clip B — Orylo (separate system): consent → verified correction + receipt → billing review stays pending
let caseRef = "";
await record(
  "b_orylo",
  async (p) => {
    await p.goto(`${BASE}/portal/cases/new`);
    await p.getByRole("button", { name: "Open my case" }).click();
    await p.waitForURL(/\/portal\/cases\/ORY-\d+/, { timeout: 30000 });
    caseRef = p.url().match(/(ORY-\d+)/)[1];
    await p.getByRole("region", { name: "Apply your earlier cancellation" }).waitFor({ timeout: 40000 });
    await p.waitForTimeout(2500);
    await p
      .getByRole("region", { name: "Apply your earlier cancellation" })
      .getByRole("button", { name: "Yes, go ahead" })
      .click();
    await p.getByText("1 of 3 verified").waitFor({ timeout: 40000 });
    await p.waitForTimeout(2500);
    await p
      .getByRole("region", { name: "Open a billing review for the charge" })
      .getByRole("button", { name: "Yes, go ahead" })
      .click();
    await p.getByText("2 of 3 verified").waitFor({ timeout: 40000 });
    await p
      .getByText(/No money has moved/)
      .first()
      .scrollIntoViewIfNeeded();
    await p.waitForTimeout(3500);
  },
  { storageState: state },
);

// Clip C — public receipt check + human escalation preserved
let receipt = "";
{
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, storageState: state });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/portal/cases/${caseRef}`);
  receipt = ((await p.locator("main").innerText()).match(/RCPT-\d{8}-[A-F0-9]{16}/) ?? [""])[0];
  await ctx.close();
}
await record("c_receipt", async (p) => {
  await p.goto(`${BASE}/demo`);
  await p.locator("#receipt-no").scrollIntoViewIfNeeded();
  await p.waitForTimeout(800);
  await p.locator("#receipt-no").pressSequentially(receipt, { delay: 22 });
  await p.getByRole("button", { name: "Verify receipt" }).click();
  await p.getByText("Genuine receipt").waitFor({ timeout: 20000 });
  await p.waitForTimeout(3000);
});
await record(
  "d_human",
  async (p) => {
    await p.goto(`${BASE}/portal/cases/${caseRef}`);
    await p.getByRole("heading", { name: "Talk to a person" }).scrollIntoViewIfNeeded();
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: "Request a callback" }).click();
    await p.getByText("Waiting for a team member to pick it up.").waitFor({ timeout: 30000 });
    await p.waitForTimeout(2500);
  },
  { storageState: state },
);
await browser.close();

// cards (plain text on the product's colours)
const cards = {
  c0: [
    "A fictional customer cancelled a subscription.",
    "Then was charged again.",
    "Northfield Digital — synthetic demo data",
  ],
  c1: ["eGain AI Agent (public page)", "Answers from the Northfield policy documents.", "Real recording"],
  c2: [
    "Orylo — a separate system",
    "Executes the governed fix, then proves it.",
    "The eGain agent does not call Orylo yet.",
  ],
  c3: ["Receipts are signed and publicly checkable.", "Nothing about the customer is revealed."],
  c4: ["Orylo", "The ticket was closed. The problem wasn't."],
};
const py = `
from PIL import Image, ImageDraw, ImageFont
import json,sys
cards=json.loads(sys.argv[1]); out=sys.argv[2]
def font(sz):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf","/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]:
        try: return ImageFont.truetype(p,sz)
        except Exception: pass
    return ImageFont.load_default()
for k,lines in cards.items():
    im=Image.new("RGB",(${W},${H}),(11,24,34)); d=ImageDraw.Draw(im)
    y=${H}//2-len(lines)*34
    for i,l in enumerate(lines):
        f=font(46 if i==0 else 30); w=d.textlength(l,font=f)
        d.text(((${W}-w)/2,y),l,font=f,fill=(168,240,222) if i==0 else (230,238,242)); y+=70 if i==0 else 52
    im.save(f"{out}/{k}.png")
`;
writeFileSync(`${tmp}/cards.py`, py);
execFileSync("python3", [`${tmp}/cards.py`, JSON.stringify(cards), tmp]);
const seq = [
  ["c0", 3],
  ["c1", 2.5],
  ["a_egain"],
  ["c2", 3],
  ["b_orylo"],
  ["c3", 2.5],
  ["c_receipt"],
  ["d_human"],
  ["c4", 3.5],
];
const parts = [];
for (const [n, secs] of seq) {
  const out = `${tmp}/${n}.mp4`;
  if (secs)
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-t",
        String(secs),
        "-i",
        `${tmp}/${n}.png`,
        "-vf",
        `scale=${W}:${H},format=yuv420p`,
        "-r",
        "25",
        "-an",
        out,
      ],
      { stdio: "ignore" },
    );
  else
    execFileSync(
      "ffmpeg",
      ["-y", "-i", `${tmp}/${n}.webm`, "-vf", `scale=${W}:${H},fps=25,format=yuv420p`, "-an", out],
      { stdio: "ignore" },
    );
  parts.push(out);
}
writeFileSync(`${tmp}/list.txt`, parts.map((p) => `file '${p.replace(`${tmp}/`, "")}'`).join("\n"));
execFileSync(
  "ffmpeg",
  ["-y", "-f", "concat", "-safe", "0", "-i", `${tmp}/list.txt`, "-c", "copy", `${OUT}/orylo-demo.mp4`],
  { stdio: "ignore" },
);
const dur = execFileSync("ffprobe", [
  "-v",
  "error",
  "-show_entries",
  "format=duration",
  "-of",
  "default=nw=1:nk=1",
  `${OUT}/orylo-demo.mp4`,
])
  .toString()
  .trim();
console.log(`wrote ${OUT}/orylo-demo.mp4, ${Number(dur).toFixed(1)} s, case ${caseRef}, receipt ${receipt}`);
