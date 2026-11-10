import { can, type Permission } from "@/domain/rbac";
import type { OrgRole } from "@/db/schema";
import type { Command } from "./client";

interface Item {
  href: string;
  label: string;
  perm?: Permission;
  group: "Work" | "Admin";
  keywords?: string;
}
export const NAV: Item[] = [
  { href: "/app", label: "Command center", group: "Work", keywords: "dashboard home overview" },
  { href: "/app/cases", label: "Cases", perm: "case.read", group: "Work", keywords: "search filter queue" },
  {
    href: "/app/approvals",
    label: "Approvals",
    perm: "case.read",
    group: "Work",
    keywords: "pending approve",
  },
  {
    href: "/app/escalations",
    label: "Escalations",
    perm: "case.read",
    group: "Work",
    keywords: "human handoff queue",
  },
  {
    href: "/app/analytics",
    label: "Analytics",
    perm: "analytics.read",
    group: "Work",
    keywords: "metrics reports",
  },
  { href: "/app/notifications", label: "Notifications", group: "Work" },
  {
    href: "/app/admin",
    label: "Organization",
    perm: "org.manage",
    group: "Admin",
    keywords: "settings branding retention threshold",
  },
  {
    href: "/app/admin/members",
    label: "Members & invites",
    perm: "members.manage",
    group: "Admin",
    keywords: "roles team invitation",
  },
  {
    href: "/app/admin/policies",
    label: "Policies & knowledge",
    perm: "policy.read",
    group: "Admin",
    keywords: "documents versions gaps",
  },
  {
    href: "/app/admin/workflows",
    label: "Workflows",
    perm: "workflow.write",
    group: "Admin",
    keywords: "authoring versions publish",
  },
  {
    href: "/app/admin/integrations",
    label: "Integrations",
    perm: "integrations.manage",
    group: "Admin",
    keywords: "simulator provider egain",
  },
  { href: "/app/admin/api-keys", label: "API keys", perm: "apikeys.manage", group: "Admin" },
  {
    href: "/app/admin/ledger",
    label: "Outcome ledger",
    perm: "audit.read",
    group: "Admin",
    keywords: "evidence verify chain",
  },
  { href: "/app/admin/audit", label: "Audit log", perm: "audit.read", group: "Admin" },
  {
    href: "/app/admin/billing",
    label: "Plan & usage",
    perm: "billing.read",
    group: "Admin",
    keywords: "billing invoices upgrade",
  },
];
export const navFor = (role: OrgRole) => NAV.filter((n) => !n.perm || can(role, n.perm));
export const commandsFor = (role: OrgRole): Command[] =>
  navFor(role).map((n) => ({
    id: n.href.replace(/\W+/g, "-"),
    label: n.label,
    href: n.href,
    group: n.group,
    keywords: n.keywords,
  }));
