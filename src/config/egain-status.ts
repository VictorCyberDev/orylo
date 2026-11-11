/**
 * What is actually verified about the eGain side, shown honestly on /demo. Nothing here is aspirational: a value is
 * flipped only after the matching live test in docs/evidence/egain-live-tests.md passes against the PUBLISHED agent.
 * Override per deployment with EGAIN_KNOWLEDGE_VERIFIED=true / EGAIN_ACTIONS_LIVE=true once verified.
 */
export interface EgainStatus {
  knowledgeVerified: boolean;
  actionsLive: boolean;
  checkedOn: string;
}
export function getEgainStatus(env: NodeJS.ProcessEnv = process.env): EgainStatus {
  return {
    knowledgeVerified: env.EGAIN_KNOWLEDGE_VERIFIED === "true",
    actionsLive: env.EGAIN_ACTIONS_LIVE === "true",
    checkedOn: "2026-11-11",
  };
}
