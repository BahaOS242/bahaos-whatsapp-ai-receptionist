import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { canonicalJson, payloadHash } from "../../src/jobs/canonical";
import { createDefaultJobRegistry, PRODUCTION_JOB_DEFINITIONS } from "../../src/jobs/default-registry";
import { classifyJobError, DEFAULT_BACKOFF_SECONDS, decideAfterFailure, jobBackoffSeconds } from "../../src/jobs/policy";
import { createJobRegistry } from "../../src/jobs/registry";
import { localTimeToUtc } from "../../src/jobs/time";
import { PermanentJobError, TransientJobError } from "../../src/jobs/types";
import { loadEnv } from "../../src/config/env";

/** Pure logic: no database, no clock, no network. */
const okDef = { type: "test.ok", version: 1, schema: z.object({}), handler: async () => undefined, maxAttempts: 3, timeoutMs: 1000, idempotency: "Safe to repeat: no side effects." };

describe("registry", () => {
  it("accepts a valid definition and exposes only registered types", () => {
    const r = createJobRegistry([okDef]);
    expect(r.types()).toEqual(["test.ok"]);
    expect(r.get("nope")).toBeUndefined();
  });
  it.each([
    ["bad name", { ...okDef, type: "Bad Name!" }],
    ["version 0", { ...okDef, version: 0 }],
    ["maxAttempts 0", { ...okDef, maxAttempts: 0 }],
    ["maxAttempts 21", { ...okDef, maxAttempts: 21 }],
    ["timeout too small", { ...okDef, timeoutMs: 1 }],
    ["timeout too large", { ...okDef, timeoutMs: 10_000_000 }],
    ["missing idempotency statement", { ...okDef, idempotency: "" }],
    ["bad backoff", { ...okDef, backoffSeconds: [] }],
  ])("rejects %s", (_l, def) => {
    expect(() => createJobRegistry([def as never])).toThrow();
  });
  it("rejects duplicates", () => {
    expect(() => createJobRegistry([okDef, okDef])).toThrow(/duplicate/);
  });
  it("the PRODUCTION registry holds only real job types — no test handlers", () => {
    expect(createDefaultJobRegistry().types()).toEqual(["memory.expire_sweep"]);
    expect(PRODUCTION_JOB_DEFINITIONS.map((d) => d.type).some((t) => t.startsWith("test."))).toBe(false);
    for (const d of PRODUCTION_JOB_DEFINITIONS) expect(d.idempotency.length).toBeGreaterThan(20);
  });
});

describe("canonical payload hash", () => {
  it("is independent of key order and sensitive to content, type and version", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: [1, 2] }, b: 1 }));
    expect(payloadHash("t", 1, { a: 1 })).toBe(payloadHash("t", 1, { a: 1 }));
    expect(payloadHash("t", 1, { a: 1 })).not.toBe(payloadHash("t", 1, { a: 2 }));
    expect(payloadHash("t", 1, { a: 1 })).not.toBe(payloadHash("u", 1, { a: 1 }));
    expect(payloadHash("t", 1, { a: 1 })).not.toBe(payloadHash("t", 2, { a: 1 }));
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe("retry policy", () => {
  it("backoff is exponential-style, jittered ±20%, and BOUNDED by the table's last entry", () => {
    for (let attempt = 1; attempt <= 40; attempt++) {
      const lo = jobBackoffSeconds(attempt, DEFAULT_BACKOFF_SECONDS, () => 0);
      const hi = jobBackoffSeconds(attempt, DEFAULT_BACKOFF_SECONDS, () => 1);
      const base = DEFAULT_BACKOFF_SECONDS[Math.min(attempt - 1, DEFAULT_BACKOFF_SECONDS.length - 1)];
      expect(lo).toBe(Math.round(base * 0.8));
      expect(hi).toBe(Math.round(base * 1.2));
    }
    expect(jobBackoffSeconds(1000, DEFAULT_BACKOFF_SECONDS, () => 1)).toBeLessThanOrEqual(1080);
    const seq = [1, 2, 3, 4, 5].map((a) => jobBackoffSeconds(a, DEFAULT_BACKOFF_SECONDS, () => 0.5));
    expect([...seq].sort((a, b) => a - b)).toEqual(seq); // non-decreasing
  });
  it("classifies errors; arbitrary exceptions keep only their class name (no message)", () => {
    expect(classifyJobError(new TransientJobError("x"))).toMatchObject({ retryable: true, code: "x" });
    expect(classifyJobError(new PermanentJobError("y"))).toMatchObject({ retryable: false, code: "y" });
    const c = classifyJobError(new Error("customer +12425550100 secret"));
    expect(c).toEqual({ retryable: true, code: "unhandled_exception", message: "unhandled Error" });
    expect(classifyJobError("string")).toMatchObject({ retryable: true, code: "unhandled_exception" });
  });
  it("decision: permanent fails at once; transient retries until max attempts, then fails", () => {
    const t = { retryable: true, code: "c", message: "m" };
    expect(decideAfterFailure({ ...t, retryable: false }, 1, 5)).toEqual({ kind: "fail", reason: "permanent" });
    expect(decideAfterFailure(t, 1, 3).kind).toBe("retry");
    expect(decideAfterFailure(t, 2, 3).kind).toBe("retry");
    expect(decideAfterFailure(t, 3, 3)).toEqual({ kind: "fail", reason: "attempts_exhausted" });
    expect(decideAfterFailure(t, 9, 3)).toEqual({ kind: "fail", reason: "attempts_exhausted" });
  });
});

describe("business-local time -> UTC instant (America/Nassau, DST-aware)", () => {
  const nassau = (y: number, mo: number, d: number, h: number, mi: number) => localTimeToUtc("America/Nassau", { year: y, month: mo, day: d, hour: h, minute: mi }).toISOString();
  it("winter (EST, UTC-5) and summer (EDT, UTC-4)", () => {
    expect(nassau(2026, 1, 15, 9, 0)).toBe("2026-01-15T14:00:00.000Z");
    expect(nassau(2026, 7, 15, 9, 0)).toBe("2026-07-15T13:00:00.000Z");
  });
  it("spring-forward gap (2026-03-08 02:30 does not exist) resolves just after the gap", () => {
    expect(nassau(2026, 3, 8, 2, 30)).toBe("2026-03-08T07:30:00.000Z"); // = 03:30 EDT
  });
  it("fall-back ambiguity (2026-11-01 01:30 occurs twice) resolves to the FIRST occurrence", () => {
    expect(nassau(2026, 11, 1, 1, 30)).toBe("2026-11-01T05:30:00.000Z"); // EDT, not 06:30Z EST
  });
  it("times either side of the transitions are exact", () => {
    expect(nassau(2026, 3, 8, 1, 59)).toBe("2026-03-08T06:59:00.000Z");
    expect(nassau(2026, 3, 8, 3, 0)).toBe("2026-03-08T07:00:00.000Z");
    expect(nassau(2026, 11, 1, 2, 0)).toBe("2026-11-01T07:00:00.000Z");
  });
  it("the result never depends on the server's local timezone", () => {
    const prev = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        expect(nassau(2026, 7, 15, 9, 0)).toBe("2026-07-15T13:00:00.000Z");
      }
    } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
  });
  it("rejects garbage", () => {
    expect(() => localTimeToUtc("America/Nassau", { year: NaN, month: 1, day: 1, hour: 0, minute: 0 })).toThrow();
  });
});

describe("feature flags (env)", () => {
  const base = { DATABASE_URL: "postgres://u:p@localhost:5432/d" };
  it("JOBS_ENABLED defaults to false; only the literal true enables it; junk is rejected", () => {
    expect(loadEnv(base).JOBS_ENABLED).toBe(false);
    expect(loadEnv({ ...base, JOBS_ENABLED: "true" }).JOBS_ENABLED).toBe(true);
    expect(loadEnv({ ...base, JOBS_ENABLED: "false" }).JOBS_ENABLED).toBe(false);
    expect(() => loadEnv({ ...base, JOBS_ENABLED: "yes" })).toThrow(/JOBS_ENABLED/);
  });
  it("is independent of MEMORY_ENABLED (all four combinations parse as set)", () => {
    for (const j of ["true", "false"] as const) for (const m of ["true", "false"] as const) {
      const e = loadEnv({ ...base, JOBS_ENABLED: j, MEMORY_ENABLED: m });
      expect([e.JOBS_ENABLED, e.MEMORY_ENABLED]).toEqual([j === "true", m === "true"]);
    }
  });
  it("polling/concurrency are bounded", () => {
    expect(() => loadEnv({ ...base, JOBS_POLL_INTERVAL_MS: "10" })).toThrow();
    expect(() => loadEnv({ ...base, JOBS_CONCURRENCY: "0" })).toThrow();
    expect(() => loadEnv({ ...base, JOBS_CONCURRENCY: "500" })).toThrow();
  });
});

describe("isolation from customer messaging", () => {
  it("nothing under src/jobs imports a messaging provider or Meta client (WhatsApp stays in the outbox)", () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
    walk(join(process.cwd(), "src", "jobs"));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/from ["'][^"']*messaging\/(whatsapp-messaging-provider|messaging-provider|create-messaging-provider|mock-messaging-provider)/);
      expect(text, f).not.toMatch(/graph\.facebook\.com/);
    }
  });
});
