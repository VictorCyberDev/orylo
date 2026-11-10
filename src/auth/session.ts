import { cache } from "react";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customerAccessGrants, customers, memberships, organizations, type OrgRole } from "@/db/schema";
import { getAuth } from "./auth";
import { can, type Permission } from "@/domain/rbac";
import type { Ctx } from "@/domain/context";
import { sha256Hex } from "@/domain/crypto";

export const ORG_COOKIE = "orylo_org";
export const GRANT_COOKIE = "orylo_grant";

export const getUser = cache(async () => {
  const s = await getAuth().api.getSession({ headers: await headers() });
  return s?.user ?? null;
});

export interface StaffSession {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; slug: string; synthetic: boolean };
  role: OrgRole;
  ctx: Ctx;
  orgs: { id: string; name: string; role: OrgRole }[];
}

/** Staff identity = a user with an ACTIVE membership. The org is validated against memberships on every request. */
export const getStaff = cache(async (): Promise<StaffSession | null> => {
  const user = await getUser();
  if (!user) return null;
  const rows = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")));
  if (!rows.length) return null;
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const pick = rows.find((r) => r.org.id === wanted) ?? rows[0];
  return {
    user: { id: user.id, name: user.name, email: user.email },
    org: { id: pick.org.id, name: pick.org.name, slug: pick.org.slug, synthetic: pick.org.synthetic },
    role: pick.role,
    ctx: { orgId: pick.org.id, actor: { type: "operator", id: user.id, role: pick.role } },
    orgs: rows.map((r) => ({ id: r.org.id, name: r.org.name, role: r.role })),
  };
});

export async function requireStaff(perm?: Permission): Promise<StaffSession> {
  const s = await getStaff();
  if (!s) redirect("/sign-in?next=/app");
  if (perm && !can(s.role, perm)) redirect("/app?denied=1");
  return s;
}

export interface CustomerSession {
  customer: { id: string; name: string; email: string };
  org: { id: string; name: string };
  via: "login" | "grant";
  ctx: Ctx;
  caseScope?: string | null;
}

/** Customer identity = a logged-in user linked to a customer row, OR a valid, unexpired access grant cookie. */
export const getCustomer = cache(async (): Promise<CustomerSession | null> => {
  const user = await getUser();
  if (user) {
    const [c] = await db
      .select({ c: customers, o: organizations })
      .from(customers)
      .innerJoin(organizations, eq(organizations.id, customers.organizationId))
      .where(eq(customers.userId, user.id));
    if (c)
      return {
        customer: { id: c.c.id, name: c.c.name, email: c.c.email },
        org: { id: c.o.id, name: c.o.name },
        via: "login",
        ctx: { orgId: c.o.id, actor: { type: "customer", id: user.id, customerId: c.c.id } },
      };
  }
  const token = (await cookies()).get(GRANT_COOKIE)?.value;
  if (token) {
    const [g] = await db
      .select({ g: customerAccessGrants, c: customers, o: organizations })
      .from(customerAccessGrants)
      .innerJoin(
        customers,
        and(
          eq(customers.id, customerAccessGrants.customerId),
          eq(customers.organizationId, customerAccessGrants.organizationId),
        ),
      )
      .innerJoin(organizations, eq(organizations.id, customerAccessGrants.organizationId))
      .where(
        and(
          eq(customerAccessGrants.tokenHash, sha256Hex(token)),
          isNull(customerAccessGrants.revokedAt),
          gt(customerAccessGrants.expiresAt, new Date()),
        ),
      );
    if (g)
      return {
        customer: { id: g.c.id, name: g.c.name, email: g.c.email },
        org: { id: g.o.id, name: g.o.name },
        via: "grant",
        caseScope: g.g.caseId,
        ctx: { orgId: g.o.id, actor: { type: "customer", id: `grant:${g.g.id}`, customerId: g.c.id } },
      };
  }
  return null;
});

export async function requireCustomer(): Promise<CustomerSession> {
  const c = await getCustomer();
  if (!c) redirect("/sign-in?next=/portal");
  return c;
}
