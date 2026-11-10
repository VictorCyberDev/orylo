import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { solutions } from "@/content/solutions";
export const metadata: Metadata = { title: "Solutions", description: "Where Orylo applies — and what is actually built versus on the roadmap.", alternates: { canonical: "/solutions" } };
export default function Solutions() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="mb-10 max-w-2xl"><p className="t-label mb-2">Solutions</p><h1 className="t-h1">Working today, and honestly labelled.</h1><p className="mt-3 text-muted">&ldquo;Working&rdquo; means implemented and tested in this repository against a <strong>synthetic</strong> provider. &ldquo;Roadmap&rdquo; means designed but not built.</p></header>
      <ul className="grid gap-4 md:grid-cols-2">
        {solutions.map((s) => (
          <li key={s.slug}><Link href={`/solutions/${s.slug}`} className="block h-full rounded-lg border border-border bg-surface p-6 shadow-sm hover:border-border-strong">
            <div className="mb-2 flex items-center justify-between gap-3"><h2 className="t-h2">{s.name}</h2><Badge tone={s.status === "working" ? "success" : "neutral"}>{s.status === "working" ? "Working (synthetic)" : "Roadmap"}</Badge></div>
            <p className="text-muted">{s.short}</p>
          </Link></li>
        ))}
      </ul>
    </div>
  );
}
