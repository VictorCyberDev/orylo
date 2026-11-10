import type { Metadata } from "next";
import { requireCustomer } from "@/auth/session";
import { db } from "@/db";
import { getSubscriptionProvider } from "@/adapters/subscription";
import { NewCaseForm } from "@/components/new-case-form";
import { Alert, Card, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Start a case" };
export default async function NewCase() {
  const c = await requireCustomer();
  const accounts = await getSubscriptionProvider(db, c.org.id).then((p) => p.listAccounts(c.org.id, c.customer.id)).then((a) => a.map((x) => x.accountNumber)).catch(() => []);
  return (
    <>
      <PageHeader title="Tell us what happened" description="Once. We'll check the facts before suggesting anything, and nothing changes without your yes." />
      <div className="max-w-2xl space-y-4"><Alert tone="info">This is a demonstration with fictional data. Real money never moves.</Alert><Card className="p-6"><NewCaseForm accounts={accounts} /></Card></div>
    </>
  );
}
