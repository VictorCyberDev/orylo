/** Synthetic demo identities (see src/seed/world.ts). The shared password is never rendered unless DEMO_MODE=true or a reviewer code is accepted. */
export interface DemoPerson {
  who: string;
  role: string;
  email: string;
  href: string;
  note: string;
}
export const demoPeople: DemoPerson[] = [
  {
    who: "Jordan Reyes",
    role: "Customer",
    email: "jordan.reyes@customer.example",
    href: "/portal",
    note: "Cancelled 9 days ago, charged again 3 days ago. Both actions are available ($29.99).",
  },
  {
    who: "Priya Nair",
    role: "Customer",
    email: "priya.nair@customer.example",
    href: "/portal",
    note: "$149.00 charge — the billing review needs a team member's approval.",
  },
  {
    who: "Marcus Bell",
    role: "Customer",
    email: "marcus.bell@customer.example",
    href: "/portal",
    note: "Already cancelled but charged afterwards — review only.",
  },
  {
    who: "Elena Rossi",
    role: "Customer",
    email: "elena.rossi@customer.example",
    href: "/portal",
    note: "Never asked to cancel — no permitted automatic action; goes to a person.",
  },
  {
    who: "Ana Ortiz",
    role: "Operator",
    email: "ana@northfield.example",
    href: "/app",
    note: "Works cases, proposes and runs permitted actions, owns escalations.",
  },
  {
    who: "Ben Lindqvist",
    role: "Approver",
    email: "ben@northfield.example",
    href: "/app/approvals",
    note: "Approves higher-value reviews; approves policy and workflow changes.",
  },
  {
    who: "Olivia Park",
    role: "Owner",
    email: "owner@northfield.example",
    href: "/app/admin",
    note: "Admin: members, policies, workflows, keys, audit, billing (test mode).",
  },
];
