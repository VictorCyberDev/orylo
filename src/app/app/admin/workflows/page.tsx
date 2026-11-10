import type { Metadata } from "next";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { listWorkflows } from "@/domain/admin";
import { can } from "@/domain/rbac";
import { WorkflowEditor } from "@/components/admin-forms";
import { ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, DataTable, PageHeader, Td, Th, When } from "@/components/ui";
import { workflowPublishAction } from "../../../actions";
export const metadata: Metadata = { title: "Workflows" };
export default async function Workflows({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const s = await requireStaff("workflow.write");
  const sp = await searchParams;
  const rows = await listWorkflows(db, s.ctx);
  const target = rows.find((r) => r.v.id === sp.edit) ?? rows.find((r) => r.v.status === "PUBLISHED");
  const canPublish = can(s.role, "workflow.publish");
  return (
    <>
      <PageHeader title="Workflows" description="Typed, versioned definitions. Saving creates a validated draft; a different person publishes it. Running cases keep the version they started on." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card><CardHeader title="Versions" />
          <DataTable caption="Workflow versions"><thead><tr><Th>Workflow</Th><Th>Ver</Th><Th>Status</Th><Th>Nodes</Th><Th></Th></tr></thead>
            <tbody>{rows.map(({ def, v }) => (
              <tr key={v.id}><Td><span className="font-medium">{def.name}</span><div className="t-code text-muted">{def.key}</div></Td><Td className="t-num">v{v.version}</Td><Td><Badge tone={v.status === "PUBLISHED" ? "success" : v.status === "DRAFT" ? "warning" : "neutral"}>{v.status.toLowerCase()}</Badge>{v.publishedAt ? <div className="t-caption"><When at={v.publishedAt} /></div> : null}</Td><Td className="t-num">{(v.spec as { nodes?: unknown[] }).nodes?.length ?? 0}</Td>
                <Td><div className="flex flex-col gap-2"><a className="text-sm underline" href={`/app/admin/workflows?edit=${v.id}`}>Open in editor</a>{v.status === "DRAFT" && canPublish ? <ActionForm action={workflowPublishAction}><input type="hidden" name="id" value={v.id} /><SubmitButton variant="secondary">Publish</SubmitButton></ActionForm> : null}</div></Td></tr>
            ))}</tbody></DataTable></Card>
        <Card><CardHeader title={target ? `Editor — ${target.def.name} v${target.v.version}` : "Editor"} description="Node types: lookup · decision · collect_info · set_objective · propose_actions · await_objectives · escalate · end" />
          <div className="p-5">{target ? <WorkflowEditor initial={JSON.stringify(target.v.spec, null, 2)} /> : null}</div></Card>
      </div>
    </>
  );
}
