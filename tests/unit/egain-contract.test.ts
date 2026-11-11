import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CASE_STATES } from "@/domain/case-machine";

/**
 * Offline contract check: the OpenAPI document that is handed to eGain must describe the routes that exist, and its
 * examples must use real values. (Behavioural conformance — status codes, envelopes — is tested live against the running
 * app in tests/e2e/egain-api.spec.ts. This test only stops the document and the code from drifting apart silently.)
 */
type Spec = {
  paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
};
/** Minimal structural reader for our own document (avoids a YAML dependency): paths → methods → operationId + response codes. */
function readSpec(text: string): Spec {
  const paths: Spec["paths"] = {};
  let path = "";
  let method = "";
  let inResponses = false;
  for (const line of text.split("\n")) {
    if (/^components:/.test(line)) break;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^ {2}(\/\S+):\s*$/))) {
      path = m[1];
      paths[path] = {};
      method = "";
    } else if (path && (m = line.match(/^ {4}(get|post|put|patch|delete):\s*$/))) {
      method = m[1];
      paths[path][method] = { operationId: "", responses: {} };
      inResponses = false;
    } else if (method && (m = line.match(/^ {6}operationId:\s*(\S+)/)))
      paths[path][method].operationId = m[1];
    else if (method && /^ {6}responses:\s*$/.test(line)) inResponses = true;
    else if (method && inResponses && (m = line.match(/^ {8}'(\d{3})':/)))
      paths[path][method].responses[m[1]] = true;
  }
  return { paths };
}
const spec = readSpec(readFileSync("egain/action-contracts/openapi.yaml", "utf8"));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routeFiles(p) : n === "route.ts" ? [p] : [];
  });
}
function implemented(): Set<string> {
  const out = new Set<string>();
  for (const f of routeFiles("src/app/api/v1")) {
    const path =
      "/" +
      f
        .replace(/^src\/app\//, "")
        .replace(/\/route\.ts$/, "")
        .replace(/\[([^\]]+)\]/g, "{$1}");
    const src = readFileSync(f, "utf8");
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"])
      if (new RegExp(`export (async function|const) ${m}\\b`).test(src))
        out.add(`${m.toLowerCase()} ${path}`);
  }
  return out;
}
const norm = (p: string) => p.replace(/\{[^}]+\}/g, "{}");

describe("eGain action contract (openapi.yaml) vs implemented routes", () => {
  it("documents exactly the implemented operations", () => {
    const doc = new Set<string>();
    for (const [p, ops] of Object.entries(spec.paths))
      for (const m of Object.keys(ops)) doc.add(`${m} ${norm(p)}`);
    const impl = new Set([...implemented()].map((x) => x.replace(/\{[^}]+\}/g, "{}")));
    expect([...doc].sort()).toEqual([...impl].sort());
  });
  it("has unique operation ids and a 429 documented wherever the API rate-limits", () => {
    const ids = Object.values(spec.paths).flatMap((ops) => Object.values(ops).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    for (const ops of Object.values(spec.paths))
      for (const o of Object.values(ops)) expect(Object.keys(o.responses)).toContain("429");
  });
  it("examples use real case states and no longer the invented IN_PROGRESS", () => {
    const text = readFileSync("egain/action-contracts/openapi.yaml", "utf8");
    const states = [...text.matchAll(/caseState:\s*([A-Z_]+)/g)].map((m) => m[1]);
    expect(states.length).toBeGreaterThan(0);
    for (const s of states) expect(CASE_STATES as readonly string[], s).toContain(s);
  });
  it("documents the receipt number format the implementation enforces", () => {
    const text = readFileSync("egain/action-contracts/openapi.yaml", "utf8");
    expect(text).toContain("^RCPT-[0-9]{8}-[A-F0-9]{16}$");
    const route = readFileSync("src/app/api/v1/receipts/[no]/verify/route.ts", "utf8");
    expect(route).toContain("^RCPT-\\d{8}-[A-F0-9]{16}$");
  });
  it("does not promise a 409 on repeated escalation (the implementation is idempotent)", () => {
    const esc = spec.paths["/api/v1/egain/cases/{caseReference}/escalations"].post;
    expect(Object.keys(esc.responses)).not.toContain("409");
  });
});
