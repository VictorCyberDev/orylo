import { beforeEach, describe, expect, it } from "vitest";
import { and, count, eq, sql } from "drizzle-orm";
import { db, freshWorld, op, cust, openRecoveryCase } from "../helpers";
import type { World } from "@/seed/world";
import {
  auditEvents,
  caseEvents,
  caseEvidence,
  customers,
  dataRequests,
  outcomeLedger,
  resolutionCases,
  users,
} from "@/db/schema";
import { JPEG, PDF, PDF_WITH_JS, PNG } from "../fixtures";
import { addEvidence, getEvidenceFile, validateUpload } from "@/domain/uploads";
import { exportMyData, listDataRequests, processErasure, requestErasure } from "@/domain/privacy";
import { exportOrganizationStream } from "@/domain/admin";
import { getCaseView } from "@/domain/case-view";
import { addNote, transitionCase } from "@/domain/cases";
import type { Ctx } from "@/domain/context";

let w: World;
beforeEach(async () => {
  w = await freshWorld();
});

describe("evidence is validated structurally and encrypted at rest", () => {
  it("stores ciphertext (never the plaintext), serves plaintext to authorised readers, and detects stored tampering", async () => {
    const { ctx, row } = await openRecoveryCase(w, "jordan");
    const ev = await addEvidence(db, ctx, row.id, {
      filename: "receipt.png",
      contentType: "image/png",
      bytes: PNG,
    });
    const [raw] = await db.select().from(caseEvidence).where(eq(caseEvidence.id, ev.id));
    expect(raw.content.subarray(0, 4).toString()).toBe("OEV1");
    expect(raw.content.includes(PNG.subarray(0, 16))).toBe(false); // PNG signature/IHDR not visible in storage
    expect(raw.sha256).toHaveLength(64);
    const file = await getEvidenceFile(db, ctx, ev.id);
    expect(file.content.equals(PNG)).toBe(true);
    expect((await getEvidenceFile(db, op(w), ev.id)).content.equals(PNG)).toBe(true); // staff of the same org
    await expect(getEvidenceFile(db, cust(w, "marcus"), ev.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getEvidenceFile(db, op(w, "keOperator"), ev.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const tampered = Buffer.from(raw.content);
    tampered[tampered.length - 1] ^= 0xff;
    await db.update(caseEvidence).set({ content: tampered }).where(eq(caseEvidence.id, ev.id));
    await expect(getEvidenceFile(db, ctx, ev.id)).rejects.toThrow();
  });

  it("rejects scripted PDFs, truncated or trailing-data images, and accepts clean files of every allowed type", async () => {
    expect(() => validateUpload("a.pdf", "application/pdf", PDF_WITH_JS)).toThrow(/scripts/);
    expect(() => validateUpload("a.png", "image/png", PNG.subarray(0, PNG.length - 4))).toThrow();
    expect(() => validateUpload("a.png", "image/png", Buffer.concat([PNG, Buffer.from("PK")]))).toThrow(
      /unexpected data/,
    );
    expect(() => validateUpload("a.pdf", "application/pdf", PDF)).not.toThrow();
    expect(() => validateUpload("a.jpg", "image/jpeg", JPEG)).not.toThrow();
    expect(() => validateUpload("a.txt", "text/plain", Buffer.from("hello"))).not.toThrow();
  });
});

describe("customer data export", () => {
  it("contains only the customer's own data, in customer-safe form, and is refused to read-only links", async () => {
    const a = await openRecoveryCase(w, "jordan");
    await openRecoveryCase(w, "marcus");
    await addNote(db, op(w), a.row.id, "INTERNAL: do not disclose", "internal");
    const data = await exportMyData(db, a.ctx);
    const json = JSON.stringify(data);
    expect(data.profile.email).toBe("jordan.reyes@customer.example");
    expect(data.cases).toHaveLength(1);
    expect(json).not.toMatch(/marcus|INTERNAL: do not disclose|executor|authorizationRef/i);
    const ro: Ctx = {
      ...a.ctx,
      actor: { ...(a.ctx.actor as Extract<Ctx["actor"], { type: "customer" }>), readOnly: true },
    };
    await expect(exportMyData(db, ro)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportMyData(db, op(w))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("erasure on request", () => {
  it("is a request/approval process with authorisation, refuses open cases, and erases personal data while preserving the integrity records", async () => {
    const a = await openRecoveryCase(w, "jordan");
    await addEvidence(db, a.ctx, a.row.id, { filename: "receipt.png", contentType: "image/png", bytes: PNG });
    const { reopenCase } = await import("@/domain/cases");
    await transitionCase(db, a.ctx, a.row.id, {
      to: "CANCELLED",
      message: "never mind, call me on 0123456789",
    });
    await reopenCase(db, a.ctx, a.row.id, "still charged, my phone is 0123456789");
    await transitionCase(db, a.ctx, a.row.id, { to: "CANCELLED" });

    const req = await requestErasure(db, a.ctx, "please remove my data");
    await expect(requestErasure(db, a.ctx)).rejects.toMatchObject({ code: "CONFLICT" }); // one pending at a time
    await expect(requestErasure(db, op(w))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(processErasure(db, op(w, "nfOperator"), req.id, "approve")).rejects.toMatchObject({
      code: "FORBIDDEN",
    }); // no privacy.manage
    await expect(processErasure(db, op(w, "keOwner"), req.id, "approve")).rejects.toMatchObject({
      code: "NOT_FOUND",
    }); // other tenant
    await expect(listDataRequests(db, op(w, "nfAnalyst"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(processErasure(db, op(w, "nfAdmin"), req.id, "reject")).rejects.toMatchObject({
      code: "VALIDATION",
    }); // must explain

    // an open case blocks erasure
    const other = await openRecoveryCase(w, "marcus");
    void other;
    const { openWorkflowCase } = await import("@/workflows/engine");
    await openWorkflowCase(db, a.ctx, {
      workflowKey: "missed-appointment-recovery",
      customerId: w.customers.jordan.id,
      title: "second case",
    });
    await expect(processErasure(db, op(w, "nfAdmin"), req.id, "approve")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/open cases/),
    });
    const [openCase] = await db
      .select()
      .from(resolutionCases)
      .where(
        and(eq(resolutionCases.customerId, w.customers.jordan.id), eq(resolutionCases.title, "second case")),
      );
    await transitionCase(db, a.ctx, openCase.id, { to: "CANCELLED" });

    const eventsBefore = await db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, a.row.id))
      .orderBy(caseEvents.seq);
    const ledgerBefore = await db.select({ n: count() }).from(outcomeLedger);
    expect(
      await processErasure(db, op(w, "nfAdmin"), req.id, "approve", "verified identity by phone"),
    ).toEqual({ status: "COMPLETED" });

    // personal data gone
    const [c] = await db.select().from(customers).where(eq(customers.id, w.customers.jordan.id));
    expect(c).toMatchObject({ name: "Deleted customer" });
    expect(c.email).toMatch(/^deleted-.*@invalid\.example$/);
    expect(c.anonymizedAt).not.toBeNull();
    expect(c.userId).toBeNull();
    expect(
      await db.select().from(users).where(eq(users.email, "jordan.reyes@customer.example")),
    ).toHaveLength(0); // cannot sign in
    expect(await db.select().from(caseEvidence).where(eq(caseEvidence.caseId, a.row.id))).toHaveLength(0);
    const [rc] = await db.select().from(resolutionCases).where(eq(resolutionCases.id, a.row.id));
    expect(rc).toMatchObject({ title: "Redacted case", description: "" });
    const eventsAfter = await db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, a.row.id))
      .orderBy(caseEvents.seq);
    expect(JSON.stringify(eventsAfter)).not.toMatch(/0123456789|never mind|still charged/);
    // …but the shape of history and the integrity records are intact
    expect(eventsAfter.map((e) => [e.seq, e.type, e.fromState, e.toState])).toEqual(
      eventsBefore.map((e) => [e.seq, e.type, e.fromState, e.toState]),
    );
    expect((await db.select({ n: count() }).from(outcomeLedger))[0].n).toBe(ledgerBefore[0].n);
    expect((await db.select().from(auditEvents).where(eq(auditEvents.action, "privacy.erased"))).length).toBe(
      1,
    );
    expect(JSON.stringify(await db.select().from(auditEvents))).not.toMatch(
      /jordan\.reyes@customer\.example/,
    );
    expect((await db.select().from(dataRequests))[0]).toMatchObject({ status: "COMPLETED" });
    expect((await processErasure(db, op(w, "nfAdmin"), req.id, "approve").catch((e) => e)).code).toBe(
      "CONFLICT",
    ); // not repeatable
    // the other customer is untouched
    expect((await getCaseView(db, op(w), other.row.id)).customer).toMatchObject({ name: "Marcus Bell" });
  });

  it("history stays tamper-proof: redaction only works inside the erasure procedure and only on message/payload", async () => {
    const a = await openRecoveryCase(w, "jordan");
    await expect(
      db.update(caseEvents).set({ message: "x" }).where(eq(caseEvents.caseId, a.row.id)),
    ).rejects.toThrow();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('orylo.redaction','on', true)`);
        await tx.update(caseEvents).set({ type: "forged" }).where(eq(caseEvents.caseId, a.row.id)); // structural change refused even with the flag
      }),
    ).rejects.toThrow();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('orylo.redaction','on', true)`);
        await tx.delete(caseEvents).where(eq(caseEvents.caseId, a.row.id)); // deletes never allowed
      }),
    ).rejects.toThrow();
    // ledger/audit stay fully immutable (row-level triggers only fire when a row exists, so create one first)
    const { confirmAction } = await import("@/domain/actions");
    await confirmAction(db, a.ctx, a.actions[0].id, true);
    expect((await db.select({ n: count() }).from(outcomeLedger))[0].n).toBeGreaterThan(0);
    await expect(db.update(outcomeLedger).set({ finalOutcome: "FAILED" })).rejects.toThrow();
  });
});

describe("organization export is streamed, authorised and tenant-scoped", () => {
  it("emits NDJSON with meta + rows only for the caller's tenant; analysts and operators cannot export", async () => {
    await openRecoveryCase(w, "jordan");
    await openRecoveryCase(w, "keJordan");
    const read = async (s: ReadableStream<Uint8Array>) => {
      const r = s.getReader();
      const dec = new TextDecoder();
      let out = "";
      for (;;) {
        const { value, done } = await r.read();
        if (done) break;
        out += dec.decode(value);
      }
      return out
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { type: string; row?: Record<string, unknown> });
    };
    const lines = await read(await exportOrganizationStream(db, op(w, "nfOwner")));
    expect(lines[0]).toMatchObject({ type: "meta", organizationId: w.orgs.nf });
    const types = new Set(lines.map((l) => l.type));
    for (const t of ["customer", "case", "objective", "event"]) expect(types.has(t)).toBe(true);
    expect(JSON.stringify(lines)).not.toMatch(/jreyes@kestrel|Kestrel/);
    expect(lines.filter((l) => l.type === "case")).toHaveLength(1);
    await expect(exportOrganizationStream(db, op(w, "nfOperator"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(exportOrganizationStream(db, op(w, "nfAnalyst"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(exportOrganizationStream(db, cust(w, "jordan"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
