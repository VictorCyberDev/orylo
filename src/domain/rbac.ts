import type { OrgRole } from "@/db/schema";
import { forbidden } from "./errors";

export const PERMISSIONS = [
  "case.read",
  "case.write",
  "case.assign",
  "action.execute",
  "approval.decide",
  "escalation.manage",
  "notes.write",
  "policy.read",
  "policy.write",
  "policy.approve",
  "workflow.write",
  "workflow.publish",
  "org.manage",
  "members.manage",
  "apikeys.manage",
  "integrations.manage",
  "audit.read",
  "analytics.read",
  "billing.read",
  "billing.manage",
  "export.run",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];

/** Least privilege. `admin` deliberately cannot manage billing; authors of policy cannot approve it (separation of duties). */
export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "billing.manage"),
  policy_manager: ["case.read", "policy.read", "policy.write", "workflow.write", "analytics.read"],
  operator: ["case.read", "case.write", "case.assign", "action.execute", "escalation.manage", "notes.write", "policy.read", "analytics.read"],
  approver: ["case.read", "approval.decide", "policy.read", "policy.approve", "workflow.publish", "escalation.manage", "analytics.read"],
  analyst: ["case.read", "policy.read", "analytics.read", "audit.read"],
};

export const can = (role: OrgRole | undefined, perm: Permission) => !!role && ROLE_PERMISSIONS[role].includes(perm);

export function requirePermission(role: OrgRole | undefined, perm: Permission): void {
  if (!can(role, perm)) throw forbidden(`Missing permission: ${perm}`);
}
