/**
 * Single source for the public identity. "Orylo" is an UNCLEARED working name: no trademark search, domain
 * ownership or legal exclusivity is claimed. Renaming = edit this file (+ public/ assets) and nothing else.
 */
export const brand = {
  name: "Orylo",
  wordmark: "orylo",
  legalName: "Orylo (working name — not a registered entity)",
  tagline: "Verified resolution, not just closed tickets.",
  description:
    "Orylo is a governed customer exception-resolution platform. It detects what went wrong, decides what is allowed, executes with consent, and verifies the outcome before saying it is done.",
  category: "Verified Resolution Infrastructure",
  // Placeholder domain on the reserved .example TLD — no domain is owned or implied.
  domain: "orylo.example",
  siteUrl: process.env.APP_URL ?? "http://localhost:3000",
  emailSender: { name: "Orylo", address: "notifications@orylo.example" },
  demoContact: {
    email: "support@demo.orylo.example",
    phone: "+1 (555) 010-0100",
    note: "Demonstration contact details only.",
  },
  themeColor: { light: "#F7F8F6", dark: "#0C1620" },
} as const;
