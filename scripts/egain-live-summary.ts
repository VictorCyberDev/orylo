/** Builds docs/evidence/egain-live-tests.md from the per-case JSON written by `npm run test:live`. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = "docs/evidence/egain-live/knowledge";
const rows = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
const pass = rows.filter((r) => r.verdict === "PASS").length;
const refusals = rows.filter((r) => r.refusal).length;
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const out = [
  "# Live knowledge acceptance — real published eGain agent",
  "",
  `Generated from \`${dir}/*.json\` (run: ${rows[0]?.ranAt ?? "n/a"}). Agent ID \`015f4f90-8772-4065-9e64-894b3615c5d3\`. Each reply below is the agent's actual text.`,
  "",
  `**Result: ${pass} of ${rows.length} cases passed. ${refusals} replies were the out-of-scope refusal.** A pass on a refusal-allowed case (K12, K13) proves only that the agent did not misbehave — it proves nothing about policy knowledge.`,
  "",
  "| Case | Area | Governing source | Verdict | Agent's actual reply (truncated) | Why it failed |",
  "|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.id} | ${esc(r.area)} | ${esc(r.source)} | **${r.verdict}** | ${esc(r.reply.slice(0, 160))}${r.reply.length > 160 ? "…" : ""} | ${esc((r.failures ?? []).join("; "))} |`,
  ),
  "",
].join("\n");
writeFileSync("docs/evidence/egain-live-tests.md", out);
console.log(`wrote docs/evidence/egain-live-tests.md (${pass}/${rows.length} passed)`);
