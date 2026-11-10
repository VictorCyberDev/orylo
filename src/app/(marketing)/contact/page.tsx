import type { Metadata } from "next";
import { LeadForm } from "@/components/lead-form";
export const metadata: Metadata = { title: "Request access", description: "Ask for early access or a conversation about failed cancellations, billing exceptions and service recovery.", alternates: { canonical: "/contact" } };
export default function Contact() {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
      <header className="space-y-3"><p className="t-label">Request access</p><h1 className="t-h1">Tell us what keeps coming back.</h1><p className="text-muted">We&apos;re learning which unresolved customer operations hurt most. If you run support, billing or service operations, we&apos;d like to hear about yours — and show you the demo.</p></header>
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm"><LeadForm /></div>
    </div>
  );
}
