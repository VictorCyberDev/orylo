import type { Metadata } from "next";
import { brand } from "@/config/brand";
export const metadata: Metadata = { title: "About", description: "The founding idea behind Orylo.", alternates: { canonical: "/about" } };
export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-14 sm:px-6">
      <header className="space-y-3"><p className="t-label">About</p><h1 className="t-h1">We want unfinished customer problems to become finished.</h1></header>
      <p className="t-body-lg">Support tools are good at conversations and tickets. Customers care about neither. They care that the subscription actually stopped, the charge was actually looked at, the technician actually came.</p>
      <h2 className="t-h2">What we believe</h2>
      <ul className="list-disc space-y-2 pl-5 text-muted"><li>Closed is not the same as resolved. Resolved means we checked.</li><li>Automation should be allowed to act only as far as policy and the customer&apos;s consent allow — and should stop and ask a person when it isn&apos;t sure.</li><li>The customer should never have to start over.</li><li>Measure outcomes honestly; label models as models.</li></ul>
      <h2 className="t-h2">Where we are</h2>
      <p className="text-muted">{brand.name} is an early build, started in November 2026, demonstrated on synthetic data. The name is a working name that has not been cleared for trademark or domain use. We have not talked to customers yet; everything about the market on this site is a hypothesis we intend to test.</p>
    </div>
  );
}
