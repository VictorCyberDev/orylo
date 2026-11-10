import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { listInvitations, listMembers } from "@/domain/admin";
import { ROLE_PERMISSIONS } from "@/domain/rbac";
import { InviteForm } from "@/components/admin-forms";
import { ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, DataTable, PageHeader, Td, Th, When, inputClass } from "@/components/ui";
import { deactivateAction, roleAction } from "../../../actions";
export const metadata: Metadata = { title: "Members & invites" };
export default async function Members() {
  const s = await requireStaff("members.manage");
  const [members, invites] = [await listMembers(db, s.ctx), await listInvitations(db, s.ctx)];
  const roles = Object.keys(ROLE_PERMISSIONS);
  return (
    <>
      <PageHeader
        title="Members & invitations"
        description="Least privilege: pick the smallest role that fits. Policy authors can't approve their own work."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Members" />
          <DataTable caption="Organization members">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td>
                    {m.name}
                    <div className="t-caption">{m.email}</div>
                  </Td>
                  <Td>
                    <ActionForm action={roleAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={m.userId} />
                      <label className="sr-only" htmlFor={`role-${m.id}`}>
                        Role for {m.name}
                      </label>
                      <select
                        id={`role-${m.id}`}
                        name="role"
                        defaultValue={m.role}
                        className={`${inputClass} min-h-9 w-auto`}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="secondary">Save</SubmitButton>
                    </ActionForm>
                  </Td>
                  <Td>
                    <Badge tone={m.status === "active" ? "success" : "neutral"}>{m.status}</Badge>
                  </Td>
                  <Td>
                    {m.status === "active" && m.userId !== s.user.id ? (
                      <ActionForm action={deactivateAction}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <SubmitButton variant="danger">Deactivate</SubmitButton>
                      </ActionForm>
                    ) : (
                      <span className="t-caption">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Invite a teammate" />
            <div className="p-5">
              <InviteForm roles={roles} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Invitations" />
            {invites.length === 0 ? (
              <p className="p-5 text-sm text-muted">None yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {invites.slice(0, 8).map((i) => (
                  <li key={i.id} className="px-5 py-3">
                    {i.email} · {i.role.replace("_", " ")}
                    <div className="t-caption">
                      {i.acceptedAt ? (
                        "Accepted"
                      ) : i.revokedAt ? (
                        "Revoked"
                      ) : new Date(i.expiresAt) < new Date() ? (
                        "Expired"
                      ) : (
                        <>
                          Expires <When at={i.expiresAt} />
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
