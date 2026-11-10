import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Card, LinkButton } from "@/components/ui";
import { solutions } from "@/content/solutions";
export function generateStaticParams() {
  return solutions.map((s) => ({ slug: s.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = solutions.find((x) => x.slug === slug);
  return s ? { title: s.name, description: s.short, alternates: { canonical: `/solutions/${s.slug}` } } : {};
}
export default async function Solution({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = solutions.find((x) => x.slug === slug);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-14 sm:px-6">
      <header className="space-y-3">
        <Badge tone={s.status === "working" ? "success" : "neutral"}>
          {s.status === "working" ? "Working today (synthetic provider)" : "Roadmap — not built"}
        </Badge>
        <h1 className="t-h1">{s.name}</h1>
        <p className="t-body-lg">{s.problem}</p>
      </header>
      <section aria-labelledby="how">
        <h2 id="how" className="t-h2 mb-3">
          How the loop applies
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted">
          {s.how.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="t-h3 text-success">Works today</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
            {s.works.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="t-h3">Roadmap / limits</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
            {s.roadmap.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="flex gap-3">
        <LinkButton href={s.status === "working" ? "/demo" : "/contact"}>
          {s.status === "working" ? "Try it in the demo" : "Tell us about your case"}
        </LinkButton>
        <LinkButton href="/solutions" variant="secondary">
          All solutions
        </LinkButton>
      </div>
    </div>
  );
}
