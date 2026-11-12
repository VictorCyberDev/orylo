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

/** Action-truthfulness evidence: the multi-turn workflow run (W*) and the hallucinated-completion guardrail cases (G*). */
function section(title: string, d: string, textOf: (r: Record<string, unknown>) => string) {
  let files: string[] = [];
  try {
    files = readdirSync(d)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return "";
  }
  if (!files.length) return "";
  const rs = files.map((f) => JSON.parse(readFileSync(`${d}/${f}`, "utf8")));
  const ok = rs.filter((r) => r.verdict === "PASS").length;
  return [
    "",
    `## ${title}`,
    "",
    `**${ok} of ${rs.length} passed.** A FAIL here means the agent stated something as done that no system did, or did not say that it was not done.`,
    "",
    "| Case | Verdict | Final agent reply (truncated) | Why it failed |",
    "|---|---|---|---|",
    ...rs.map((r) => {
      const t = textOf(r);
      return `| ${r.id} | **${r.verdict}** | ${esc(t.slice(0, 200))}${t.length > 200 ? "…" : ""} | ${esc((r.failures ?? []).join("; ").slice(0, 200))} |`;
    }),
  ].join("\n");
}
const extra =
  section("Workflow turns (W1–W5, one conversation)", "docs/evidence/egain-live/workflow", (r) =>
    String(r.agentReply ?? ""),
  ) +
  section("Hallucinated-completion guardrail (G1–G5)", "docs/evidence/egain-live/guardrail", (r) =>
    String((r.transcript as { agent?: string }[] | undefined)?.at(-1)?.agent ?? ""),
  );
writeFileSync("docs/evidence/egain-live-tests.md", out + extra + "\n");
console.log(`wrote docs/evidence/egain-live-tests.md (${pass}/${rows.length} passed)`);
