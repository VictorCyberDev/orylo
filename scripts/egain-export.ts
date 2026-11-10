/** Writes the policy pack to egain/knowledge/*.md so the eGain knowledge and Orylo's policy can never drift. */
import { mkdirSync, writeFileSync } from "node:fs";
import { POLICY_PACK } from "../src/policy/pack";
mkdirSync("egain/knowledge", { recursive: true });
for (const d of POLICY_PACK) writeFileSync(`egain/knowledge/${d.key}.md`, d.body);
console.log(`wrote ${POLICY_PACK.length} policy documents to egain/knowledge/`);
