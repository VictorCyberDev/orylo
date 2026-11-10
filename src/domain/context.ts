import type { OrgRole } from "@/db/schema";

/**
 * Every domain call receives a Ctx. `orgId` is mandatory and is applied to EVERY query, so tenant
 * isolation does not depend on UI navigation.
 *
 *  - operator: staff member with a membership role in `orgId`
 *  - customer: a verified customer; `customerId` pins them to their own records
 *  - channel:  an external channel (eGain) acting for a customer that was verified in the pre-chat step
 *  - system:   Orylo itself (workflow engine, jobs)
 */
export type Actor =
  | { type: "operator"; id: string; role: OrgRole }
  | { type: "customer"; id: string; customerId: string }
  | { type: "channel"; id: string; customerId: string; keyId?: string }
  | { type: "system"; id: string }
  | { type: "integration"; id: string };

export interface Ctx {
  orgId: string;
  actor: Actor;
  requestId?: string;
}

export const systemCtx = (orgId: string, id = "orylo-engine"): Ctx => ({
  orgId,
  actor: { type: "system", id },
});

export const actorCustomerId = (a: Actor): string | undefined =>
  a.type === "customer" || a.type === "channel" ? a.customerId : undefined;
/** Role matrix treats a verified channel like the customer it represents. */
export const actorKind = (a: Actor): "customer" | "operator" | "system" =>
  a.type === "operator"
    ? "operator"
    : a.type === "system" || a.type === "integration"
      ? "system"
      : "customer";
