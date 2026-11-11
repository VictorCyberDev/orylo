import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { listDataRequests } from "@/domain/privacy";
import { ActionForm, SubmitButton } from "@/components/client";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  Td,
  Th,
  When,
  inputClass,
} from "@/components/ui";
import { processErasureAction } from "../../../actions";
export const metadata: Metadata = { title: "Privacy requests" };

export default async function Privacy() {
  const s = await requireStaff("privacy.manage");
  const rows = await listDataRequests(db, s.ctx);
  return (
    <>
      <PageHeader
        title="Privacy requests"
        description="Customers can download their data themselves. Erasure requests land here for a person to approve or decline."
      />
      <div className="mb-4">
        <Alert tone="info" title="What erasure does">
          Removes the login, profile details, uploaded files, notifications, access links, case titles and the
          personal content of case history. It keeps the append-only skeleton of history (ids, order, states,
          times), the outcome ledger and the audit log, which hold provider identifiers but no names or
          emails. It is refused while the customer has open cases.
        </Alert>
      </div>
      <Card>
        <CardHeader title="Requests" />
        {rows.length === 0 ? (
          <EmptyState title="No requests" />
        ) : (
          <DataTable caption="Privacy requests">
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Requested</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th>Decision</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, name, email }) => (
                <tr key={r.id}>
                  <Td>
                    {name}
                    <div className="t-caption">{email}</div>
                  </Td>
                  <Td>
                    <When at={r.createdAt} />
                  </Td>
                  <Td className="max-w-xs text-sm">{r.reason ?? "—"}</Td>
                  <Td>
                    <Badge
                      tone={
                        r.status === "COMPLETED" ? "success" : r.status === "REJECTED" ? "neutral" : "warning"
                      }
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                    {r.note ? <div className="t-caption mt-1">{r.note}</div> : null}
                  </Td>
                  <Td>
                    {r.status === "PENDING" ? (
                      <ActionForm action={processErasureAction} className="space-y-2">
                        <input type="hidden" name="id" value={r.id} />
                        <Field id={`note-${r.id}`} label="Note (required to decline)">
                          <input id={`note-${r.id}`} name="note" className={`${inputClass} min-h-9`} />
                        </Field>
                        <div className="flex gap-2">
                          <button
                            name="decision"
                            value="approve"
                            className="min-h-9 rounded-md bg-primary px-3 text-sm text-primary-fg"
                          >
                            Erase data
                          </button>
                          <button
                            name="decision"
                            value="reject"
                            className="min-h-9 rounded-md border border-border-strong px-3 text-sm"
                          >
                            Decline
                          </button>
                        </div>
                      </ActionForm>
                    ) : (
                      <SubmitNone />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
function SubmitNone() {
  return <span className="t-caption">—</span>;
}
void SubmitButton;
