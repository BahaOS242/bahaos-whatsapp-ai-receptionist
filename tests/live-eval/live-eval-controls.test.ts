import { afterEach, describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import type { AIProvider, AIProviderResponse } from "../../src/ai/types";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { APPROVED_MODELS, BudgetExceeded, ConfigError, inputTokenUpperBound, Ledger, MAX_CAP_USD, parseConfig, UsageUnknown } from "../../scripts/live-eval/config";
import { CappedClient, CASES, restoreClock, runCase, scoreCase, type Case, type MessagesSdk, type StepRecord } from "../../scripts/live-eval/harness";

/**
 * OFFLINE regressions for the live-evaluation harness (Codex review of PR #2 at 5762e25).
 * No network, no API key, no spend: the SDK is a mock and the "model" is an injected provider.
 */
afterEach(() => restoreClock());
const ENV = {} as Record<string, string | undefined>;
const OK = (cap = "1.48", passes?: string) => parseConfig([`--cap=${cap}`, ...(passes ? [`--passes=${passes}`] : [])], ENV);

describe("run configuration cannot be silently coerced", () => {
  it.each(["invalid", "NaN", "Infinity", "-Infinity", "-1", "0", "0.0", "", "1e3", "1,5", " 2", "0x10", String(MAX_CAP_USD + 1)])("rejects --cap=%j", (cap) => {
    expect(() => parseConfig([`--cap=${cap}`], ENV)).toThrow(ConfigError);
  });
  it("requires an explicit cap (no default spend authority)", () => {
    expect(() => parseConfig([], ENV)).toThrow(/--cap/);
  });
  it.each(["0", "-1", "11", "1.5", "abc", "Infinity", "NaN", ""])("rejects --passes=%j", (p) => {
    expect(() => parseConfig(["--cap=1", `--passes=${p}`], ENV)).toThrow(ConfigError);
  });
  it("accepts a sane configuration and defaults passes to 1", () => {
    const c = OK("1.48");
    expect(c).toMatchObject({ capUsd: 1.48, passes: 1, model: APPROVED_MODELS[0] });
    expect(c.price).toMatchObject({ inputUsdPerMTok: 1, outputUsdPerMTok: 5, snapshotDate: "2026-10-06" });
    expect(OK("10", "3").passes).toBe(3);
  });
  it.each(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5", "claude-haiku-5-5", "claude-haiku-4-5-20251001 ", "anything"])("refuses non-allowlisted model %j", (m) => {
    expect(() => parseConfig(["--cap=1"], { ANTHROPIC_MODEL: m })).toThrow(/approved list/);
  });
});

const sdkReturning = (usage: unknown, extra: Partial<Awaited<ReturnType<MessagesSdk["messages"]["create"]>>> = {}) => {
  const calls: Array<Record<string, unknown>> = [];
  const sdk: MessagesSdk = { messages: { create: async (b) => { calls.push(b); return { model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: "ok" }], usage: usage as never, ...extra }; } } };
  return { sdk, calls };
};
const chat = (c: CappedClient, text = "hi") => c.chat({ systemPrompt: "system prompt ".repeat(50), messages: [{ role: "user", content: text }] });

describe("spend ledger and gate (mock SDK, no network)", () => {
  it("settles real usage at the named price snapshot", async () => {
    const l = new Ledger(OK("5"));
    const { sdk } = sdkReturning({ input_tokens: 1000, output_tokens: 100 });
    await chat(new CappedClient(sdk, l));
    expect(l.spentUsd).toBeCloseTo((1000 * 1 + 100 * 5) / 1e6, 10);
    expect([l.calls, l.inputTokens, l.outputTokens]).toEqual([1, 1000, 100]);
  });
  it("EXHAUSTED budget: refuses before any request is sent", async () => {
    const l = new Ledger(OK("0.001"));
    const { sdk, calls } = sdkReturning({ input_tokens: 1, output_tokens: 1 });
    await expect(chat(new CappedClient(sdk, l))).rejects.toBeInstanceOf(BudgetExceeded);
    expect(calls).toHaveLength(0);
    expect(l.haltedReason).toMatch(/could cost up to/);
    await expect(chat(new CappedClient(sdk, l))).rejects.toBeInstanceOf(BudgetExceeded); // stays halted
  });
  it("stops mid-run once cumulative spend + worst case would cross the cap", async () => {
    const l = new Ledger(OK("0.02"));
    const { sdk, calls } = sdkReturning({ input_tokens: 300, output_tokens: 1000 }); // ≈ $0.0053 per call, inside the input bound
    const c = new CappedClient(sdk, l);
    let sent = 0;
    for (let i = 0; i < 10; i++) { try { await chat(c); sent++; } catch (e) { expect(e).toBeInstanceOf(BudgetExceeded); break; } }
    expect(calls.length).toBe(sent);
    expect(sent).toBeLessThan(10);
    expect(l.spentUsd).toBeLessThanOrEqual(0.02);
  });
  it("UNDER-ESTIMATED token count (actual usage above our own bound) halts the run", async () => {
    const l = new Ledger(OK("5"));
    const chars = "system prompt ".repeat(50).length + JSON.stringify([{ role: "user", content: "hi" }]).length;
    const { sdk } = sdkReturning({ input_tokens: 10_000_000, output_tokens: 1 });
    await expect(chat(new CappedClient(sdk, l))).rejects.toBeInstanceOf(UsageUnknown);
    expect(l.haltedReason).toMatch(/under-estimated/);
    expect(chars).toBeGreaterThan(0);
    await expect(chat(new CappedClient(sdk, l))).rejects.toBeInstanceOf(BudgetExceeded); // nothing further is sent
  });
  it.each([undefined, {}, { input_tokens: "12", output_tokens: 3 }, { input_tokens: NaN, output_tokens: 3 }, { input_tokens: 3, output_tokens: -1 }])("UNKNOWN/garbled usage %j: worst case is charged and the run halts", async (usage) => {
    const l = new Ledger(OK("5"));
    const { sdk } = sdkReturning(usage);
    await expect(chat(new CappedClient(sdk, l))).rejects.toBeInstanceOf(UsageUnknown);
    expect(l.spentUsd).toBeGreaterThan(0.005); // the reserved worst case, not zero
    expect(l.haltedReason).toMatch(/usage unknown|no usable usage/);
  });
  it("TRANSPORT failure: charged at worst case, run halts, nothing is retried", async () => {
    const l = new Ledger(OK("5"));
    let n = 0;
    const sdk: MessagesSdk = { messages: { create: async () => { n++; throw new Error("socket hang up"); } } };
    await expect(chat(new CappedClient(sdk, l))).rejects.toBeInstanceOf(BudgetExceeded);
    expect(n).toBe(1);
    expect(l.spentUsd).toBeGreaterThan(0.005);
    expect(l.haltedReason).toMatch(/request failed/);
    await expect(chat(new CappedClient(sdk, l))).rejects.toBeInstanceOf(BudgetExceeded);
    expect(n).toBe(1);
  });
  it("the input bound over-reserves (≥ chars/2) so ordinary prompts are comfortably inside it", () => {
    expect(inputTokenUpperBound(8000)).toBeGreaterThanOrEqual(4000);
  });
});

// ---------------- scoring: the pre-confirmation guard ----------------
const step = (kind: StepRecord["kind"], input: string, actions: StepRecord["actions"] = []): StepRecord => ({ in: input, kind, reply: "", state: {}, actions });
const L1 = CASES.find((c) => c.id.startsWith("L1 "))!;

describe("scorer: a booking on ANY turn before the approval is a hard failure — including the final identity input", () => {
  const book = [{ type: "request_appointment", success: true }];
  it("the exact hole Codex found: booking on the LAST setup turn (name+phone) with a correct payload", () => {
    const steps = [...L1.setup.slice(0, -1).map((s) => step("setup", s)), step("setup", L1.setup.at(-1)!, book), step("approval", "yes")];
    const r = scoreCase(L1, steps, [{ name: "Trevor", preferredTime: "15:00" }]);
    expect(r.hard.join(" ")).toMatch(/BEFORE the explicit approval/);
  });
  it.each([0, 1, 2, 3, 4])("booking on setup turn %i is rejected", (i) => {
    const steps = [...L1.setup.map((s, k) => step("setup", s, k === i ? book : [])), step("approval", "yes")];
    expect(scoreCase(L1, steps, [{ name: "Trevor", preferredTime: "15:00" }]).hard.length).toBeGreaterThan(0);
  });
  it("a FAILED booking attempt before approval is also rejected (attempts count, not only successes)", () => {
    const steps = [...L1.setup.map((s, k) => step("setup", s, k === 4 ? [{ type: "request_appointment", success: false }] : [])), step("approval", "yes")];
    expect(scoreCase(L1, steps, []).hard.length).toBeGreaterThan(0);
  });
  it("a correct run (booking only on the approval turn) has no hard failures", () => {
    const steps = [...L1.setup.map((s) => step("setup", s)), step("approval", "yes", book)];
    const r = scoreCase(L1, steps, [{ name: "Trevor", preferredTime: "15:00" }]);
    expect(r).toMatchObject({ hard: [], soft: [], successfulBookings: 1 });
  });
  it("wrong payload fields are hard failures", () => {
    const steps = [...L1.setup.map((s) => step("setup", s)), step("approval", "yes", book)];
    expect(scoreCase(L1, steps, [{ name: "Actually", preferredTime: "14:00" }]).hard).toHaveLength(2);
  });
  it("no booking when one was expected is a SOFT shortfall, never a pass", () => {
    const steps = [...L1.setup.map((s) => step("setup", s)), step("approval", "yes")];
    expect(scoreCase(L1, steps, []).soft).toContain("no successful booking was completed");
  });
});

describe("scorer: L15 requires exactly ONE successful booking (not zero, not two)", () => {
  const L15 = CASES.find((c) => c.id.startsWith("L15"))!;
  const book = [{ type: "request_appointment", success: true }];
  const setup = L15.setup.map((s) => step("setup", s));
  it("zero bookings is NOT a pass", () => {
    const r = scoreCase(L15, [...setup, step("approval", "yes"), step("approval", "yes")], []);
    expect(r.hard.length + r.soft.length).toBeGreaterThan(0);
    expect(r.soft).toContain("no successful booking was completed");
  });
  it("one booking passes; two is a hard failure", () => {
    expect(scoreCase(L15, [...setup, step("approval", "yes", book), step("approval", "yes")], [{ name: "Trevor", preferredTime: "14:00" }])).toMatchObject({ hard: [], soft: [] });
    expect(scoreCase(L15, [...setup, step("approval", "yes", book), step("approval", "yes", book)], [{ name: "Trevor", preferredTime: "14:00" }, { name: "Trevor", preferredTime: "14:00" }]).hard.join(" ")).toMatch(/exactly 1/);
  });
  it("the ambiguous-time case allows no booking at all", () => {
    const L14 = CASES.find((c) => c.id.startsWith("L14"))!;
    expect(scoreCase(L14, L14.setup.map((s) => step("setup", s)), []).hard).toEqual([]);
    expect(scoreCase(L14, [...L14.setup.map((s) => step("setup", s, [])), step("approval", "yes", book)], []).hard.length).toBeGreaterThan(0);
  });
});

// ---------------- end to end with an INJECTED provider (no model, no network) ----------------
function injectedAgent(bookOnTurn: number | null): ReceptionistAgent {
  let turn = 0;
  const provider: AIProvider = {
    async generateResponse(req): Promise<AIProviderResponse> {
      turn++;
      const actions = turn === bookOnTurn
        ? [{ type: "request_appointment" as const, payload: { name: "Trevor", phone: "+12428012847", service: "Routine cleaning", preferredDate: "Tuesday", preferredTime: "15:00" } }]
        : [];
      return { reply: "ok", actions, bookingState: req.bookingState };
    },
  };
  return new ReceptionistAgent(provider, createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE));
}
const SHORT: Case = { id: "inject", setup: ["I want a cleaning", "yes", "Tuesday 2pm", "actually 3pm", "Trevor 2428012847"], approvals: ["yes"], expectBookings: "exactlyOne", expectPayload: { name: "Trevor", preferredTime: "15:00" } };

describe("runCase with an injected misbehaving provider (the mutation Codex asked for)", () => {
  it("provider books on the FINAL IDENTITY turn (turn 5) with a correct-looking payload → hard failure, even though a later YES is never needed", async () => {
    const r = await runCase(SHORT, 1, injectedAgent(5), () => null);
    expect(r.hard.join(" ")).toMatch(/setup turn 5 .* BEFORE the explicit approval/);
    expect(r.steps[4].actions.some((a) => a.type === "request_appointment")).toBe(true); // and the artifact now RECORDS it per turn
    expect(r.steps.map((s) => s.kind)).toEqual(["setup", "setup", "setup", "setup", "setup", "approval"]);
  });
  it("provider books on an EARLIER turn (turn 2) → hard failure", async () => {
    expect((await runCase(SHORT, 1, injectedAgent(2), () => null)).hard.join(" ")).toMatch(/BEFORE the explicit approval/);
  });
  it("provider books only on the approval turn (turn 6) → clean, one recorded successful booking", async () => {
    const r = await runCase(SHORT, 1, injectedAgent(6), () => null);
    expect(r.hard).toEqual([]);
    expect(r.successfulBookings).toBe(1);
    expect(r.steps.at(-1)).toMatchObject({ kind: "approval", actions: [{ type: "request_appointment", success: true }] });
  });
  it("provider never books → soft shortfall (with a recorded retry approval), not a pass", async () => {
    const r = await runCase({ ...SHORT, retryApproval: true }, 1, injectedAgent(null), () => null);
    expect(r.soft).toEqual(expect.arrayContaining(["no successful booking was completed", "needed a second approval turn"]));
    expect(r.steps.filter((s) => s.kind === "approval")).toHaveLength(2);
  });
  it("the run halts when the ledger reports a halt (the agent swallows provider errors)", async () => {
    await expect(runCase(SHORT, 1, injectedAgent(null), () => "budget gate")).rejects.toBeInstanceOf(BudgetExceeded);
  });
  it("every recorded step carries its executed actions and success flags", async () => {
    const r = await runCase(SHORT, 1, injectedAgent(6), () => null);
    for (const s of r.steps) expect(Array.isArray(s.actions)).toBe(true);
  });
});
