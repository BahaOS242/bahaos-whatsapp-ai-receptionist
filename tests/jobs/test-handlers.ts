import { z } from "zod";
import { createJobRegistry, type JobRegistry } from "../../src/jobs/registry";
import { PermanentJobError, TransientJobError, type JobContext, type JobDefinition } from "../../src/jobs/types";

/**
 * TEST-ONLY handlers. They live under tests/ and are passed to the worker
 * explicitly; the production registry (src/jobs/default-registry.ts) cannot
 * reach them. Behaviour is selected by the payload's `op`.
 */
export interface Execution { jobId: string; tenantId: string; attempt: number; op: string; at: number }

export const scriptedPayload = z
  .object({
    op: z.enum(["ok", "transient_until", "transient", "permanent", "unhandled", "sleep", "hang", "heartbeat", "gate"]),
    until: z.number().int().min(1).optional(),
    ms: z.number().int().min(0).max(10_000).optional(),
    gate: z.string().optional(),
    note: z.string().max(100).optional(),
  })
  .strict();
export type ScriptedPayload = z.infer<typeof scriptedPayload>;

export interface TestHarness {
  executions: Execution[];
  gates: Map<string, { promise: Promise<void>; release: () => void; entered: () => void; enteredPromise: Promise<void> }>;
  registry: JobRegistry;
  gate(name: string): { release: () => void; entered: Promise<void> };
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); }, { once: true });
  });

export function createTestHarness(opts: { timeoutMs?: number; extra?: JobDefinition[]; maxAttempts?: number } = {}): TestHarness {
  const executions: Execution[] = [];
  const gates: TestHarness["gates"] = new Map();
  const ensureGate = (name: string) => {
    let g = gates.get(name);
    if (!g) {
      let release!: () => void, entered!: () => void;
      const promise = new Promise<void>((r) => (release = r));
      const enteredPromise = new Promise<void>((r) => (entered = r));
      g = { promise, release, entered, enteredPromise };
      gates.set(name, g);
    }
    return g;
  };

  const handler = async (ctx: JobContext, p: ScriptedPayload) => {
    executions.push({ jobId: ctx.jobId, tenantId: ctx.tenantId, attempt: ctx.attempt, op: p.op, at: Date.now() });
    switch (p.op) {
      case "ok": return { result: { ran: true } };
      case "transient_until":
        if (ctx.attempt < (p.until ?? 2)) throw new TransientJobError("test_transient", "scripted transient failure");
        return { result: { attempt: ctx.attempt } };
      case "transient": throw new TransientJobError("test_transient", "scripted transient failure");
      case "permanent": throw new PermanentJobError("test_permanent", "scripted permanent failure");
      case "unhandled": throw new Error("customer phone +12425550100 leaked");
      case "sleep": await sleep(p.ms ?? 100, ctx.signal); return { result: { slept: true } };
      case "hang": await sleep(60_000, ctx.signal); return;
      case "heartbeat": {
        const a = await ctx.heartbeat();
        const b = await ctx.heartbeat();
        return { result: { heartbeats: [a, b] } };
      }
      case "gate": {
        const g = ensureGate(p.gate ?? "default");
        g.entered();
        await g.promise;
        return { result: { by: ctx.attempt } };
      }
    }
  };

  const def = (type: string, timeoutMs: number): JobDefinition<ScriptedPayload> => ({
    type, version: 1, schema: scriptedPayload, handler, maxAttempts: opts.maxAttempts ?? 5, timeoutMs,
    backoffSeconds: [15, 30, 60], idempotency: "Test handler: records executions only; safe to repeat.",
  });
  const registry = createJobRegistry([
    def("test.scripted", opts.timeoutMs ?? 2_000) as JobDefinition,
    ...(opts.extra ?? []),
  ]);
  return {
    executions, gates, registry,
    gate: (name) => { const g = ensureGate(name); return { release: g.release, entered: g.enteredPromise }; },
  };
}
