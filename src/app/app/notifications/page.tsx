import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { listForUser } from "@/domain/notifications";
import { Badge, Button, Card, EmptyState, PageHeader, When } from "@/components/ui";
import { markAllReadAction } from "../../actions";
export const metadata: Metadata = { title: "Notifications" };
export default async function Notes() {
  const s = await requireStaff();
  const list = await listForUser(db, s.org.id, s.user.id, 100);
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <form action={markAllReadAction}>
            <Button type="submit" variant="secondary">
              Mark all read
            </Button>
          </form>
        }
      />
      <Card>
        {list.length === 0 ? (
          <EmptyState title="Nothing yet" />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className={n.readAt ? "text-sm" : "text-sm font-semibold"}>
                    {n.caseId ? (
                      <Link className="underline" href={`/app/cases/${n.caseId}`}>
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body ? <p className="t-caption">{n.body}</p> : null}
                  <p className="t-caption">
                    <When at={n.createdAt} /> · {n.type.replace("_", " ")}
                  </p>
                </div>
                {!n.readAt ? <Badge tone="accent">New</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
