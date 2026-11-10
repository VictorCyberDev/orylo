export interface Solution {
  slug: string;
  name: string;
  short: string;
  status: "working" | "roadmap";
  problem: string;
  how: string[];
  works: string[];
  roadmap: string[];
}
/** `working` = implemented and tested in this repository with SYNTHETIC providers. `roadmap` = designed, NOT built. */
export const solutions: Solution[] = [
  {
    slug: "subscription-billing-recovery",
    name: "Subscription & billing recovery",
    short: "Customers who cancelled but were charged again.",
    status: "working",
    problem: "A customer asked to cancel, the request never reached the billing system, and they were charged again. Today they repeat their story to every agent, and \"cancelled\" in the CRM does not mean billing stopped.",
    how: ["Find the earlier cancellation request and the new charge.", "Check the account's real state in the subscription system.", "Apply approved policy and ask the customer to confirm the exact step.", "Apply the cancellation once, with a signed receipt.", "Open a billing review separately — never promise a refund.", "Read the result back before saying it worked."],
    works: ["Failed Cancellation & Billing Recovery workflow, end to end, against a synthetic subscription provider", "Consent, approval above a threshold, idempotent retries, timeout-safe replay", "Verified Outcome Ledger with per-objective status (cancellation, review, decision)"],
    roadmap: ["Connectors to real billing platforms (none are built)", "Duplicate-charge auto-detection beyond the documented rule"],
  },
  {
    slug: "telecom-service-operations",
    name: "Telecom & service operations",
    short: "Missed technician visits and unfinished service changes.",
    status: "working",
    problem: "A technician did not arrive, the customer waited all day, and the follow-up depends on who answers the phone.",
    how: ["Collect the missed date and preferred windows once.", "Confirm the visit was actually in the past.", "Pass a structured request to the scheduling team with full context.", "Track until a person confirms a new slot."],
    works: ["Missed Service Appointment Recovery workflow with an internal scheduling queue and human-confirmed slot"],
    roadmap: ["Integration with a field-service scheduling system (not built; a person confirms the slot today)", "Outage and service-restoration verification from network telemetry"],
  },
  {
    slug: "digital-commerce-exceptions",
    name: "Digital commerce exceptions",
    short: "Failed fulfilment, wrong charges, partial deliveries.",
    status: "roadmap",
    problem: "Orders that fail halfway leave customers with money taken and nothing delivered, spread across payment, fulfilment and support systems.",
    how: ["Model the exception as objectives (delivered, charged correctly, refunded where approved).", "Use the same Detect → Decide → Execute → Verify loop."],
    works: ["The generic engine (versioned workflows, gateway, ledger) that this would run on"],
    roadmap: ["No commerce workflow, adapter or policy pack has been built or tested. This page describes an intended direction only."],
  },
  {
    slug: "warranty-claim-readiness",
    name: "Warranty & claim readiness",
    short: "Complete claim packets before anyone reviews them.",
    status: "working",
    problem: "Claims stall because the serial number, purchase date or proof of purchase is missing, and the customer is asked again and again.",
    how: ["Collect serial, purchase date, fault description and proof of purchase.", "Check the warranty window from approved policy.", "Assemble and verify a complete packet, then hand it to the claims team."],
    works: ["Warranty Claim Readiness workflow with validated uploads and a claims-review handoff"],
    roadmap: ["Submission into a manufacturer or insurer system (not built — the packet is handed to a person)"],
  },
  {
    slug: "general-customer-operations",
    name: "General customer operations",
    short: "Any policy-governed exception you can describe as objectives.",
    status: "roadmap",
    problem: "Every operations team has a handful of exceptions that bounce between systems and never feel finished.",
    how: ["Describe the exception as objectives, policy rules and typed operations.", "Author a workflow in the admin console; a second person publishes it.", "Run it with the same consent, approval and verification guarantees."],
    works: ["Workflow authoring with validation and separation of duties; three built-in workflows as examples"],
    roadmap: ["New operations need a developer-written adapter today; there is no no-code connector builder"],
  },
];
