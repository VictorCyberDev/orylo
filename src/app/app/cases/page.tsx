import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/auth/session";
import { db } from "@/db";
import { listCases } from "@/domain/cases";
import { CASE_STATES, STATE_LABEL } from "@/domain/case-machine";
import { listMembers } from "@/domain/admin";
import { can } from "@/domain/rbac";
import {
  buttonClass,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StateBadge,
  SyntheticBadge,
  Td,
  Th,
  When,
  inputClass,
} from "@/components/ui";
import type { CaseState } from "@/db/schema";
export const metadata: Metadata = { title: "Cases" };

type SP = {
  q?: string;
  state?: string | string[];
  priority?: string;
  assignee?: string;
  category?: string;
  from?: string;
  to?: string;
  page?: string;
  sort?: string;
};
export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireStaff("case.read");
  const sp = await searchParams;
  const states = ([] as string[])
    .concat(sp.state ?? [])
    .filter((x): x is CaseState => (CASE_STATES as readonly string[]).includes(x));
  const page = Math.max(1, Number(sp.page ?? 1));
  const limit = 20;
  const res = await listCases(db, s.ctx, {
    q: sp.q,
    states,
    priority: sp.priority ? [sp.priority as "low"] : undefined,
    assigneeUserId: sp.assignee,
    category: sp.category || undefined,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to + "T23:59:59Z") : undefined,
    limit,
    offset: (page - 1) * limit,
    sort: (sp.sort as "updated") || "updated",
  });
  const members = can(s.role, "members.manage") ? await listMembers(db, s.ctx) : [];
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v && !Array.isArray(v)) p.set(k, v);
    for (const st of states) if (!("state" in over)) p.append("state", st);
    return `/app/cases?${p}`;
  };
  return (
    <>
      <PageHeader title="Cases" description={`${res.total} matching`} />
      <Card className="mb-4 p-4">
        <form
          method="get"
          role="search"
          aria-label="Filter cases"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <div className="lg:col-span-2">
            <label htmlFor="q" className="t-label mb-1.5 block">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={sp.q}
              placeholder="Reference, title, customer, email"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="state" className="t-label mb-1.5 block">
              State
            </label>
            <select id="state" name="state" defaultValue={states[0] ?? ""} className={inputClass}>
              <option value="">Any</option>
              {CASE_STATES.map((st) => (
                <option key={st} value={st}>
                  {STATE_LABEL[st]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="priority" className="t-label mb-1.5 block">
              Priority
            </label>
            <select id="priority" name="priority" defaultValue={sp.priority ?? ""} className={inputClass}>
              <option value="">Any</option>
              {["urgent", "high", "normal", "low"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="category" className="t-label mb-1.5 block">
              Category
            </label>
            <select id="category" name="category" defaultValue={sp.category ?? ""} className={inputClass}>
              <option value="">Any</option>
              <option value="failed_cancellation">Failed cancellation</option>
              <option value="missed_appointment">Missed appointment</option>
              <option value="warranty_claim">Warranty claim</option>
            </select>
          </div>
          <div>
            <label htmlFor="assignee" className="t-label mb-1.5 block">
              Assignee
            </label>
            <select id="assignee" name="assignee" defaultValue={sp.assignee ?? ""} className={inputClass}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="t-label mb-1.5 block">
              Opened from
            </label>
            <input id="from" name="from" type="date" defaultValue={sp.from} className={inputClass} />
          </div>
          <div>
            <label htmlFor="to" className="t-label mb-1.5 block">
              Opened to
            </label>
            <input id="to" name="to" type="date" defaultValue={sp.to} className={inputClass} />
          </div>
          <div>
            <label htmlFor="sort" className="t-label mb-1.5 block">
              Sort
            </label>
            <select id="sort" name="sort" defaultValue={sp.sort ?? "updated"} className={inputClass}>
              <option value="updated">Recently updated</option>
              <option value="opened">Recently opened</option>
              <option value="priority">Priority</option>
            </select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-2">
            <button type="submit" className={buttonClass("primary")}>
              Apply filters
            </button>
            <Link href="/app/cases" className={buttonClass("ghost")}>
              Reset
            </Link>
          </div>
        </form>
      </Card>
      <Card>
        {res.rows.length === 0 ? (
          <EmptyState
            title="No cases match"
            action={
              <Link className={buttonClass("secondary")} href="/app/cases">
                Clear filters
              </Link>
            }
          >
            Try fewer filters or a different date range.
          </EmptyState>
        ) : (
          <DataTable caption="Cases">
            <thead>
              <tr>
                <Th>Case</Th>
                <Th>Customer</Th>
                <Th>State</Th>
                <Th>Priority</Th>
                <Th>Assignee</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/app/cases/${r.reference}`} className="t-code font-medium underline">
                      {r.reference}
                    </Link>{" "}
                    {r.reopenCount ? <span className="t-caption">· reopened ×{r.reopenCount}</span> : null}
                    <div className="max-w-sm truncate text-muted">{r.title}</div>
                  </Td>
                  <Td>
                    {r.customerName} {r.synthetic ? <SyntheticBadge /> : null}
                  </Td>
                  <Td>
                    <StateBadge state={r.state} />
                  </Td>
                  <Td className="capitalize">{r.priority}</Td>
                  <Td>{r.assigneeName ?? <span className="text-muted">Unassigned</span>}</Td>
                  <Td>
                    <When at={r.updatedAt} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between border-t border-border px-4 py-3 text-sm"
        >
          <span className="t-caption">
            Page {page} of {Math.max(1, Math.ceil(res.total / limit))}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link className={buttonClass("secondary", "sm")} href={qs({ page: String(page - 1) })}>
                Previous
              </Link>
            ) : null}
            {page * limit < res.total ? (
              <Link className={buttonClass("secondary", "sm")} href={qs({ page: String(page + 1) })}>
                Next
              </Link>
            ) : null}
          </span>
        </nav>
      </Card>
    </>
  );
}
