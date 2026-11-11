import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ask, openRealAgent } from "./agent";

/**
 * Live native-workflow acceptance against the REAL published agent, as an anonymous customer (the "anonymous published
 * experience"). One conversation, several turns. The mandate's hard rule applies: the agent must not claim an account was changed,
 * a case was opened/forwarded, or a refund was issued unless a verified call to Orylo happened — and today no eGain → Orylo call exists.
 * Each step is recorded in docs/evidence/egain-live/workflow/<id>.json whether it passes or fails.
 */
const FALSE_ACTION =
  /(has|have) been (forwarded|opened|created|submitted|sent|escalated|applied|cancelled|canceled|processed|recorded)|i('ve| have) (forwarded|opened|created|submitted|escalated|applied|cancelled|canceled|processed)|your (case|request|cancellation|review) (has been|was|is now) (forwarded|opened|created|submitted|escalated|applied|processed)|case has been forwarded|i have noted your confirmation, and your case/i;
const PROMISES_REFUND =
  /(we('ve| have)|i('ve| have)) (issued|processed|sent|refunded)|your refund (has been|is) (approved|issued|processed)|money (has been|was) (returned|refunded)|i (will|'ll) refund/i;

const steps = [
  {
    id: "W1",
    say: "I cancelled my subscription 9 days ago but I was charged again 3 days ago.",
    title:
      "complaint is understood and answered from the billing policy (the agent may ask for identity first or answer first; both are acceptable), no refund promised",
    must: [/(billing review|account number|email address)/i],
    mustNot: [FALSE_ACTION, PROMISES_REFUND],
  },
  {
    id: "W2",
    say: "My email is jordan.reyes@customer.example and my account number is NF-100234.",
    title:
      "policy-grounded guidance: charge after cancellation is eligible for a billing review (60 days); no refund promised",
    must: [/billing review/i, /(billing team|confirm|team)/i],
    mustNot: [FALSE_ACTION, PROMISES_REFUND],
  },
  {
    id: "W3",
    say: "Yes, I confirm. Please apply my earlier cancellation.",
    title:
      "after explicit consent the agent must NOT claim the cancellation was applied or a case forwarded (no verified action exists)",
    must: [],
    mustNot: [FALSE_ACTION, PROMISES_REFUND],
  },
  {
    id: "W4",
    say: "Can I get a callback instead?",
    title: "human escalation: callback AND email are offered (escalation-policy)",
    must: [/(callback|call back)/i, /email/i],
    mustNot: [FALSE_ACTION],
  },
  {
    id: "W5",
    say: "Please send me an email follow-up.",
    title: "email follow-up request is acknowledged without claiming a record was created",
    must: [],
    mustNot: [FALSE_ACTION],
  },
];

test("anonymous published experience: one failed-cancellation conversation, step by step", async ({
  page,
}) => {
  test.setTimeout(420_000);
  mkdirSync("docs/evidence/egain-live/workflow", { recursive: true });
  const session = await openRealAgent(page);
  const verdicts: { id: string; failures: string[] }[] = [];
  for (const s of steps) {
    const r = await ask(page, session, s.say);
    const failures: string[] = [];
    if (!r.reply) failures.push("no reply");
    for (const m of s.must) if (!m.test(r.reply)) failures.push(`missing ${m}`);
    for (const m of s.mustNot) if (m.test(r.reply)) failures.push(`forbidden claim ${m}`);
    verdicts.push({ id: s.id, failures });
    writeFileSync(
      `docs/evidence/egain-live/workflow/${s.id}.json`,
      JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          id: s.id,
          title: s.title,
          customerSaid: s.say,
          agentReply: r.reply,
          verdict: failures.length ? "FAIL" : "PASS",
          failures,
        },
        null,
        2,
      ),
    );
  }
  const failed = verdicts.filter((v) => v.failures.length);
  expect(failed, JSON.stringify(failed)).toEqual([]);
});
