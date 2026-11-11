/**
 * Builds egain/upload-pack/: the 12 authorized policy documents as clean HTML and PDF (eGain's page lists "Docs (PDF, Word,
 * HTML)" as supported knowledge sources; plain Markdown is not listed), plus a manifest with SHA-256 hashes so the owner can
 * prove which exact text was uploaded. Source of truth: src/policy/pack.ts (the same text Orylo's Action API enforces).
 * Usage: npm run egain:upload-pack   (PDF needs Chromium: set PW_CHROMIUM_PATH if Playwright's browser is not installed)
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { POLICY_PACK } from "../src/policy/pack";

const out = "egain/upload-pack";
mkdirSync(`${out}/html`, { recursive: true });
mkdirSync(`${out}/pdf`, { recursive: true });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function mdToHtml(md: string) {
  // Line-based: a heading line is its own element; consecutive text lines form one paragraph; "- " lines form a list.
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${esc(para.join(" "))}</p>`);
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("# ")) (flush(), out.push(`<h1>${esc(line.slice(2))}</h1>`));
    else if (line.startsWith("## ")) (flush(), out.push(`<h2>${esc(line.slice(3))}</h2>`));
    else if (line.startsWith("- ")) (para.length && flush(), list.push(line.slice(2)));
    else (list.length && flush(), para.push(line));
  }
  flush();
  return out.join("\n");
}
async function main() {
  const manifest: { file: string; title: string; key: string; sha256OfSourceText: string }[] = [];
  const exe = process.env.PW_CHROMIUM_PATH;
  const browser = await chromium.launch(
    exe ? { executablePath: exe, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] },
  );
  const page = await browser.newPage();
  for (const d of POLICY_PACK) {
    const title = d.title ?? d.key;
    const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="description" content="Northfield Digital (fictional) — ${esc(title)}. Synthetic demonstration policy."></head>\n<body>\n${mdToHtml(d.body)}\n<p><small>Synthetic, fictional policy for a demonstration. Document key: ${esc(d.key)}.</small></p>\n</body></html>\n`;
    writeFileSync(`${out}/html/${d.key}.html`, html);
    await page.setContent(html);
    await page.pdf({
      path: `${out}/pdf/${d.key}.pdf`,
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    });
    manifest.push({
      file: d.key,
      title,
      key: d.key,
      sha256OfSourceText: createHash("sha256").update(d.body).digest("hex"),
    });
  }
  await browser.close();
  writeFileSync(
    `${out}/manifest.json`,
    JSON.stringify(
      { generatedFrom: "src/policy/pack.ts", count: manifest.length, documents: manifest },
      null,
      2,
    ),
  );
  console.log(`wrote ${manifest.length} HTML + PDF documents and manifest.json to ${out}/`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
