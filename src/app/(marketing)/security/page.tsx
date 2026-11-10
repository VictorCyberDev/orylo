import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui";
export const metadata: Metadata = {
  title: "Security",
  description:
    "How Orylo is built to protect tenant data and prevent unsafe actions — and what it does not claim.",
  alternates: { canonical: "/security" },
};
const controls = [
  [
    "Tenant isolation",
    "Every query carries the organization id; parent/child records are joined by composite foreign keys so the database refuses cross-tenant links. Negative tests cover reads, writes, analytics, exports and audit.",
  ],
  [
    "Authentication",
    "Established library (Better Auth): scrypt password hashing, httpOnly SameSite cookies, rate limits on sign-in and reset. Email delivery for verification/reset requires a provider that is not configured in the demo.",
  ],
  [
    "Authorization",
    "Role permissions checked server-side on every call. Separation of duties: policy and workflow authors cannot approve or publish their own work.",
  ],
  [
    "Action safety",
    "Typed operations, consent with exact wording, approval thresholds, idempotency keys, replay protection, stale-state and stale-policy refusal, signed receipts.",
  ],
  [
    "Evidence",
    "Case history, audit and outcome ledger are append-only (database triggers). The ledger is hash-chained so tampering is detectable.",
  ],
  [
    "Knowledge safety",
    "Policy text is data. Authorization reads structured rules from approved versions only; instruction-like text is quarantined and never quoted.",
  ],
  [
    "Uploads",
    "2 MB limit; PNG, JPEG, PDF or plain text only; content signature must match the declared type; names sanitized; served as attachments.",
  ],
  [
    "Browser protections",
    "CSP, frame denial, nosniff, referrer policy, strict origin checks on state-changing endpoints, no open redirects.",
  ],
];
export default function Security() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-14 sm:px-6">
      <header className="max-w-3xl space-y-3">
        <p className="t-label">Security</p>
        <h1 className="t-h1">Controls that exist, and claims we don&apos;t make.</h1>
      </header>
      <Alert tone="warning" title="No certifications">
        Orylo holds no SOC 2, ISO 27001, HIPAA or other attestation, and has not had an independent
        penetration test. The environment contains synthetic data only. Do not load real customer data.
      </Alert>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {controls.map(([t, d]) => (
          <Card key={t} className="p-5">
            <h2 className="t-h3">{t}</h2>
            <p className="mt-1.5 text-sm text-muted">{d}</p>
          </Card>
        ))}
      </div>
      <section>
        <h2 className="t-h2 mb-2">Known limitations</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>
            Uploaded evidence is stored in the database (demo-grade); production would use encrypted object
            storage with malware scanning.
          </li>
          <li>No SSO/SAML, MFA or IP allow-listing yet.</li>
          <li>The in-process rate limiter is database-backed but untuned; no WAF is configured.</li>
          <li>See the repository&apos;s threat model for the full list.</li>
        </ul>
      </section>
    </div>
  );
}
