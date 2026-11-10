import { z } from "zod";

/** A tiny declarative condition language — no eval, no scripting. */
export const ConditionSchema = z.object({
  path: z.string().regex(/^\$\.[A-Za-z0-9_.]+$/),
  op: z.enum(["eq", "neq", "gt", "lt", "exists", "truthy", "falsy"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

const base = { id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), label: z.string().min(1).max(120) };
const FieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "date", "text_list", "choice", "evidence"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(true),
});
export type Field = z.infer<typeof FieldSchema>;

export const NodeSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("lookup"),
    source: z.literal("subscription_diagnosis"),
    next: z.string(),
    retry: z.object({ maxAttempts: z.number().int().min(1).max(5) }).optional(),
    onError: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("decision"),
    branches: z.array(z.object({ when: z.array(ConditionSchema).min(1), next: z.string() })).min(1),
    default: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("collect_info"),
    fields: z.array(FieldSchema).min(1),
    next: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("set_objective"),
    objectiveKey: z.string(),
    status: z.enum(["NOT_APPLICABLE", "IN_PROGRESS", "BLOCKED"]),
    detail: z.string().max(300),
    next: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("propose_actions"),
    actions: z.array(z.object({ operation: z.string(), input: z.record(z.string(), z.string()) })).min(1),
    next: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("await_objectives"),
    objectives: z.array(z.string()).min(1),
    timeoutHours: z.number().positive().optional(),
    onTimeout: z.string().optional(),
    next: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("escalate"),
    reasonCode: z.string(),
    reason: z.string().max(500),
    queueKey: z.string().optional(),
    next: z.string().optional(),
  }),
  z.object({ ...base, type: z.literal("end"), outcome: z.enum(["RESOLVED", "HANDED_OFF", "NO_ACTION"]) }),
]);
export type WorkflowNode = z.infer<typeof NodeSchema>;

export const WorkflowSpecSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]{2,60}$/),
    name: z.string().min(3).max(120),
    category: z.string().regex(/^[a-z][a-z_]{2,40}$/),
    description: z.string().max(500).optional(),
    trigger: z.object({ event: z.literal("case.opened"), category: z.string() }),
    /** Policy rule keys that must be present (approved, non-conflicting) for this workflow to take action. */
    policyAuthority: z.array(z.string()).default([]),
    requiredRole: z.enum(["customer", "operator", "system"]).default("system"),
    objectives: z
      .array(z.object({ key: z.string(), label: z.string(), required: z.boolean().default(true) }))
      .min(1),
    start: z.string(),
    nodes: z.array(NodeSchema).min(2).max(40),
    completion: z.literal("all_required_objectives_verified").default("all_required_objectives_verified"),
  })
  .superRefine((s, ctx) => {
    const ids = new Set(s.nodes.map((n) => n.id));
    if (ids.size !== s.nodes.length) ctx.addIssue({ code: "custom", message: "duplicate node ids" });
    if (!ids.has(s.start)) ctx.addIssue({ code: "custom", message: `start node ${s.start} does not exist` });
    const objs = new Set(s.objectives.map((o) => o.key));
    const refs = (n: WorkflowNode): string[] => {
      switch (n.type) {
        case "lookup":
          return [n.next, ...(n.onError ? [n.onError] : [])];
        case "decision":
          return [...n.branches.map((b) => b.next), n.default];
        case "await_objectives":
          return [n.next, ...(n.onTimeout ? [n.onTimeout] : [])];
        case "end":
          return [];
        case "escalate":
          return n.next ? [n.next] : [];
        default:
          return [n.next];
      }
    };
    for (const n of s.nodes) {
      for (const r of refs(n))
        if (!ids.has(r))
          ctx.addIssue({ code: "custom", message: `node ${n.id} points to missing node ${r}` });
      if (n.type === "await_objectives")
        for (const o of n.objectives)
          if (!objs.has(o))
            ctx.addIssue({ code: "custom", message: `node ${n.id} awaits unknown objective ${o}` });
      if (n.type === "set_objective" && !objs.has(n.objectiveKey))
        ctx.addIssue({ code: "custom", message: `node ${n.id} sets unknown objective ${n.objectiveKey}` });
    }
    // Reachability + at least one end.
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const n = s.nodes.find((x) => x.id === id);
      if (n) refs(n).forEach(walk);
    };
    walk(s.start);
    for (const n of s.nodes)
      if (!seen.has(n.id)) ctx.addIssue({ code: "custom", message: `node ${n.id} is unreachable` });
    if (!s.nodes.some((n) => n.type === "end"))
      ctx.addIssue({ code: "custom", message: "workflow needs an end node" });
  });
export type WorkflowSpec = z.infer<typeof WorkflowSpecSchema>;

export function getPath(obj: unknown, path: string): unknown {
  return path
    .replace(/^\$\./, "")
    .split(".")
    .reduce<unknown>(
      (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

export function evalCondition(c: Condition, ctx: unknown): boolean {
  const v = getPath(ctx, c.path);
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "gt":
      return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "lt":
      return typeof v === "number" && typeof c.value === "number" && v < c.value;
    case "exists":
      return v !== undefined && v !== null;
    case "truthy":
      return !!v;
    case "falsy":
      return !v;
  }
}
