import type { Metadata } from "next";
import { Alert } from "@/components/ui";
export const metadata: Metadata = { title: "Privacy (draft)", alternates: { canonical: "/legal/privacy" } };
export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-14 sm:px-6">
      <h1 className="t-h1">Privacy notice — DRAFT</h1>
      <Alert tone="warning" title="Needs legal review">This draft describes only what this demonstration actually does. It has not been reviewed by a lawyer and is not a substitute for a compliant privacy policy.</Alert>
      <h2 className="t-h2">What this site collects</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-muted"><li><strong>Access requests</strong> (name, email, optional company and message) are stored in the application database. A one-way hash of your IP address is kept for rate limiting. [Retention period: to be decided — needs legal review.]</li><li><strong>Sign-in</strong> uses a session cookie (essential; no advertising or analytics cookies are set). A theme preference is stored in your browser.</li><li><strong>Demo cases</strong> contain only fictional customers and accounts.</li></ul>
      <h2 className="t-h2">What it does not do</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-muted"><li>No third-party trackers, no analytics, no advertising.</li><li>No email is sent: there is no email provider configured.</li><li>Please do not enter real customer data anywhere in this environment.</li></ul>
      <h2 className="t-h2">Your choices</h2>
      <p className="text-muted">To ask for your access request to be deleted, use the contact form and say so. [Processes for access/deletion requests under GDPR/CCPA: needs legal review.]</p>
    </div>
  );
}
