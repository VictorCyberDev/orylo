import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { OrgForm } from "@/components/admin-forms";
import { Card, CardHeader, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Organization" };
export default async function OrgPage() {
  const s = await requireStaff("org.manage");
  const [o] = await db.select().from(organizations).where(eq(organizations.id, s.org.id));
  return (
    <>
      <PageHeader
        title="Organization"
        description="Profile, approval thresholds, retention and notification configuration."
        actions={
          <a
            className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm hover:bg-surface-2"
            href="/api/admin/export"
            download
          >
            Export data (NDJSON stream)
          </a>
        }
      />
      <Card>
        <CardHeader
          title={o.name}
          description={`Slug: ${o.slug}${o.synthetic ? " · synthetic demo organization" : ""}`}
        />
        <div className="p-5">
          <OrgForm org={o} />
        </div>
      </Card>
    </>
  );
}
