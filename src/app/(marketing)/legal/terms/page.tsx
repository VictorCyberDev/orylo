import type { Metadata } from "next";
import { Alert } from "@/components/ui";
export const metadata: Metadata = { title: "Terms (draft)", alternates: { canonical: "/legal/terms" } };
export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-14 sm:px-6">
      <h1 className="t-h1">Terms of use — DRAFT</h1>
      <Alert tone="warning" title="Needs legal review">This is a plain-language draft for a demonstration environment, not a binding contract. The entity, governing law, liability and warranty sections are placeholders.</Alert>
      <ul className="list-disc space-y-2 pl-5 text-muted"><li><strong>Demonstration only.</strong> The service runs on synthetic data and a simulated subscription provider. It does not move money, change real accounts or provide advice.</li><li><strong>No real data.</strong> Do not upload or enter real personal, financial or confidential information.</li><li><strong>No guarantees.</strong> The software is provided as is; availability and accuracy are not promised. [Warranty/liability wording: needs legal review.]</li><li><strong>Acceptable use.</strong> Don&apos;t attempt to access other tenants&apos; data, disrupt the service or probe it without permission.</li><li><strong>Name.</strong> &ldquo;Orylo&rdquo; is a working name; no trademark rights are asserted. [Entity, governing law: to be decided.]</li></ul>
    </div>
  );
}
