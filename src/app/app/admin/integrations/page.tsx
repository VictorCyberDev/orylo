import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { listIntegrations } from "@/domain/admin";
import { SimModeForm } from "@/components/admin-forms";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import type { SimMode } from "@/adapters/subscription";
export const metadata: Metadata = { title: "Integrations" };
export default async function Integrations() {
  const s = await requireStaff("integrations.manage");
  const list = await listIntegrations(db, s.ctx);
  return (
    <>
      <PageHeader title="Integrations" description="Provider adapters behind the Action Gateway. Only a simulated subscription provider is implemented." />
      <div className="mb-4"><Alert tone="info" title="What is and isn't connected">The subscription provider is a <strong>simulator</strong> backed by synthetic tables. eGain is not &ldquo;connected&rdquo; here: the eGain agent (configured on eGain&apos;s platform) calls Orylo&apos;s action API with an API key. No email provider is configured, so email is recorded as skipped.</Alert></div>
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((c) => {
          const cfg = c.config as { mode?: SimMode; delayMs?: number };
          return (
            <Card key={c.id}><CardHeader title={c.name} action={<Badge tone={c.status === "active" ? "success" : "neutral"}>{c.status}</Badge>} description={c.provider} />
              <div className="p-5">{c.provider === "demo_subscription" ? <SimModeForm mode={cfg.mode ?? "normal"} delayMs={cfg.delayMs ?? 400} /> : <p className="text-sm text-muted">{String((c.config as { note?: string }).note ?? "Not configured.")}</p>}</div></Card>
          );
        })}
      </div>
    </>
  );
}
