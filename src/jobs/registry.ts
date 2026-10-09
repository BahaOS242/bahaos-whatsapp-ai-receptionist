import type { JobDefinition } from "./types";

/**
 * The ONLY way a job type can execute: an explicit, typed allowlist. A payload
 * never names code, a handler, a URL or a prompt — only data validated by the
 * definition's schema.
 */
export interface JobRegistry {
  get(type: string): JobDefinition | undefined;
  types(): string[];
}

const TYPE_RE = /^[a-z][a-z0-9_.]{2,63}$/;

export function createJobRegistry(defs: JobDefinition[]): JobRegistry {
  const map = new Map<string, JobDefinition>();
  for (const d of defs) {
    if (!TYPE_RE.test(d.type)) throw new Error(`invalid job type name "${d.type}"`);
    if (map.has(d.type)) throw new Error(`duplicate job type "${d.type}"`);
    if (!Number.isInteger(d.version) || d.version < 1) throw new Error(`${d.type}: version must be a positive integer`);
    if (!Number.isInteger(d.maxAttempts) || d.maxAttempts < 1 || d.maxAttempts > 20) throw new Error(`${d.type}: maxAttempts must be 1..20`);
    if (!Number.isFinite(d.timeoutMs) || d.timeoutMs < 50 || d.timeoutMs > 600_000) throw new Error(`${d.type}: timeoutMs must be 50..600000`);
    if (!d.idempotency || d.idempotency.trim().length < 10) throw new Error(`${d.type}: an idempotency statement is required`);
    if (typeof d.handler !== "function" || !d.schema) throw new Error(`${d.type}: handler and schema are required`);
    if (d.backoffSeconds && (d.backoffSeconds.length === 0 || d.backoffSeconds.some((s) => !(s >= 0)))) throw new Error(`${d.type}: invalid backoffSeconds`);
    map.set(d.type, d);
  }
  return { get: (t) => map.get(t), types: () => [...map.keys()] };
}
