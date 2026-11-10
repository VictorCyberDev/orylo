import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { listApiKeys } from "@/domain/admin";
import { KeyForm } from "@/components/admin-forms";
import { ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, DataTable, EmptyState, PageHeader, Td, Th, When } from "@/components/ui";
import { revokeKeyAction } from "../../../actions";
export const metadata: Metadata = { title: "API keys" };
export default async function Keys() {
  const s = await requireStaff("apikeys.manage");
  const keys = await listApiKeys(db, s.ctx);
  return (
    <>
      <PageHeader
        title="API keys"
        description="Used by the eGain agent to call Orylo's action API. Keys are shown once and stored only as a hash."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Keys" />
          {keys.length === 0 ? (
            <EmptyState title="No keys yet">
              Create one to let an eGain agent call the action API. Requires a plan with API access.
            </EmptyState>
          ) : (
            <DataTable caption="API keys">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Prefix</Th>
                  <Th>Scopes</Th>
                  <Th>Last used</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <Td>{k.name}</Td>
                    <Td className="t-code">{k.prefix}…</Td>
                    <Td className="t-code text-xs">{k.scopes.join(", ")}</Td>
                    <Td>{k.lastUsedAt ? <When at={k.lastUsedAt} /> : "never"}</Td>
                    <Td>
                      <Badge tone={k.revokedAt ? "neutral" : "success"}>
                        {k.revokedAt ? "revoked" : "active"}
                      </Badge>
                    </Td>
                    <Td>
                      {!k.revokedAt ? (
                        <ActionForm action={revokeKeyAction}>
                          <input type="hidden" name="id" value={k.id} />
                          <SubmitButton variant="danger">Revoke</SubmitButton>
                        </ActionForm>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
        <Card>
          <CardHeader title="Create a key" />
          <div className="p-5">
            <KeyForm />
          </div>
        </Card>
      </div>
    </>
  );
}
