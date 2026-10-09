/**
 * LIVE Anthropic validation of the corrected name / next-week-date / correction behaviour (PR #2,
 * RELEASE_GATE_CHECKLIST.md §1). SIMULATED tools only: no database, no WhatsApp, no real calendar.
 * Spends real money, so it is HARD-CAPPED: every call is pre-checked against the cap and the run
 * stops itself before it could exceed it.
 *
 *   npx tsx scripts/eval-live-corrections.ts --cap=10 [--passes=3]
 *
 * Prices (USD / MTok) are for claude-haiku-4-5: $1 input, $5 output (cached table 2026-10-06).
 * Output: /private/tmp/claude-501/live-eval-results.json (synthetic transcripts only; never the key).
 */
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { BAHAMAS_DENTAL_SERVICE } from "../src/ai/business-context";
import { LLMProvider } from "../src/ai/providers/llm-provider";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "../src/ai/providers/llm-chat-client";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "../src/ai/providers/tool-definitions";
import { ReceptionistAgent } from "../src/ai/receptionist-agent";
import { createSimulatedReceptionistTools } from "../src/tools/receptionist-tools";
import { TortureConversation, type Turn } from "../tests/torture/helpers";

process.loadEnvFile?.(".env");
const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const CAP = Number(arg("cap", "10"));
const PASSES = Number(arg("passes", "3"));
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const IN_PER_TOK = 1 / 1e6, OUT_PER_TOK = 5 / 1e6; // claude-haiku-4-5
const MAX_TOKENS = 1024;
if (!/haiku-4-5/.test(MODEL)) throw new Error(`refusing to run: approved model is Haiku 4.5, got ${MODEL}`);
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

let spent = 0, calls = 0, inTok = 0, outTok = 0;
const modelsSeen = new Set<string>();

class BudgetExceeded extends Error {}
let haltedReason: string | null = null; // the agent swallows provider errors, so the gate also sets this flag
const TOOLS: Anthropic.Tool[] = RECEPTIONIST_TOOL_DEFINITIONS.filter((t): t is Extract<typeof t, { type: "function" }> => t.type === "function").map((t) => ({
  name: t.function.name, description: t.function.description, input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
}));

/** Same request shape as production AnthropicChatClient, plus usage accounting and a pre-call budget gate. */
class CappedClient implements LlmChatClient {
  private readonly sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 0 });
  async chat(p: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const approxIn = Math.ceil((p.systemPrompt.length + JSON.stringify(p.messages).length + JSON.stringify(TOOLS).length) / 3); // deliberately high
    const worst = approxIn * IN_PER_TOK + MAX_TOKENS * OUT_PER_TOK;
    if (spent + worst > CAP) { haltedReason = `next call could cost up to $${worst.toFixed(4)}; spent $${spent.toFixed(4)} of $${CAP}`; throw new BudgetExceeded(haltedReason); }
    const r = await this.sdk.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, system: p.systemPrompt, messages: p.messages.map((m) => ({ role: m.role, content: m.content })), tools: TOOLS });
    calls++; inTok += r.usage.input_tokens; outTok += r.usage.output_tokens; modelsSeen.add(r.model);
    spent += r.usage.input_tokens * IN_PER_TOK + r.usage.output_tokens * OUT_PER_TOK;
    const text = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const toolCalls = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, argumentsJson: JSON.stringify(b.input) }));
    return { content: text.length ? text : null, toolCalls };
  }
}

// Business clock: advances in real time from a fixed instant (only DAY-level resolution matters here).
const RealDate = Date;
function setClock(iso: string) {
  const off = new RealDate(iso).getTime() - RealDate.now();
  globalThis.Date = class extends RealDate {
    constructor(...a: unknown[]) { if (a.length) super(...(a as [string])); else super(RealDate.now() + off); }
    static now() { return RealDate.now() + off; }
  } as DateConstructor;
}
const FRI = "2026-10-09T16:00:00Z";

type Payload = Record<string, unknown>;
interface CaseResult { id: string; pass: number; steps: Array<{ in: string; reply: string; state: Record<string, unknown> }>; payloads: Payload[]; hard: string[]; soft: string[]; error?: string }
interface Case { id: string; clock?: string; steps: string[]; checkAfter?: Record<number, (t: Turn) => string[]>; final?: (payloads: Payload[], c: TortureConversation) => string[]; noActionBefore?: number; }

const names = (n: unknown, want: string) => (n === want ? [] : [`name ${JSON.stringify(n)} != ${want}`]);
const BASE = ["I want a cleaning", "yes", "Tuesday 2pm"];
const finalBooking = (name: string, time: string, date?: string) => (p: Payload[]) => {
  if (p.length !== 1) return [`expected exactly 1 request_appointment, got ${p.length}`];
  const e: string[] = [];
  if (p[0].name !== name) e.push(`payload name ${JSON.stringify(p[0].name)} != ${name}`);
  if (p[0].preferredTime !== time) e.push(`payload time ${JSON.stringify(p[0].preferredTime)} != ${time}`);
  if (date && p[0].preferredDate !== date) e.push(`payload date ${JSON.stringify(p[0].preferredDate)} != ${date}`);
  return e;
};
const fixTime = (idx: number) => ({ [idx]: (t: Turn) => [...(t.bookingState.time === "15:00" ? [] : [`time ${t.bookingState.time} != 15:00`]), ...(t.bookingState.name === undefined ? [] : [`name set to ${JSON.stringify(t.bookingState.name)} by a time correction`])] });

const CASES: Case[] = [
  { id: "L1 actually 3pm", steps: [...BASE, "actually 3pm", "Trevor 2428012847"], checkAfter: fixTime(3), final: finalBooking("Trevor", "15:00"), noActionBefore: 5 },
  { id: "L2 nah make it 3pm instead", steps: [...BASE, "nah make it 3pm instead", "Alicia 2425550100"], checkAfter: fixTime(3), final: finalBooking("Alicia", "15:00"), noActionBefore: 5 },
  { id: "L3 no, 3pm instead", steps: [...BASE, "no, 3pm instead", "Trevor 2428012847"], checkAfter: fixTime(3), final: finalBooking("Trevor", "15:00"), noActionBefore: 5 },
  { id: "L4 make it 3pm", steps: [...BASE, "make it 3pm", "Trevor 2428012847"], checkAfter: fixTime(3), final: finalBooking("Trevor", "15:00"), noActionBefore: 5 },
  { id: "L5 change it to 3pm please", steps: [...BASE, "change it to 3pm please", "Trevor 2428012847"], checkAfter: fixTime(3), final: finalBooking("Trevor", "15:00"), noActionBefore: 5 },
  { id: "L6 phone before name", steps: [...BASE, "actually 3pm", "2428012847", "Trevor"], checkAfter: fixTime(3), final: finalBooking("Trevor", "15:00"), noActionBefore: 6 },
  { id: "L7 known name survives correction", steps: [...BASE, "Trevor 2428012847", "actually 3pm"], checkAfter: { 4: (t) => [...names(t.bookingState.name, "Trevor"), ...(t.bookingState.time === "15:00" ? [] : [`time ${t.bookingState.time}`])] }, final: finalBooking("Trevor", "15:00"), noActionBefore: 5 },
  { id: "L8 My name is Alisha not Alicia", steps: [...BASE, "Alicia 2425550100", "My name is Alisha not Alicia"], checkAfter: { 4: (t) => names(t.bookingState.name, "Alisha") }, final: finalBooking("Alisha", "14:00"), noActionBefore: 5 },
  { id: "L9 next week Friday at 2pm", steps: ["I want a cleaning", "yes", "next week Friday at 2pm", "Trevor 2428012847"], checkAfter: { 2: (t) => [...(t.bookingState.date === "2026-10-16" ? [] : [`date ${t.bookingState.date} != 2026-10-16`]), ...(t.bookingState.name === undefined ? [] : [`name ${t.bookingState.name}`])] }, final: finalBooking("Trevor", "14:00", "2026-10-16"), noActionBefore: 4 },
  { id: "L10 Friday next week at 2pm", steps: ["I want a cleaning", "yes", "Friday next week at 2pm", "Trevor 2428012847"], final: finalBooking("Trevor", "14:00", "2026-10-16"), noActionBefore: 4 },
  { id: "L11 Sunday clock: next week Friday", clock: "2026-10-11T16:00:00Z", steps: ["I want a cleaning", "yes", "next week Friday at 2pm", "Trevor 2428012847"], final: finalBooking("Trevor", "14:00", "2026-10-16"), noActionBefore: 4 },
  { id: "L12 year rollover: next week Monday", clock: "2026-12-30T16:00:00Z", steps: ["I want a cleaning", "yes", "next week Monday at 10am", "Trevor 2428012847"], final: finalBooking("Trevor", "10:00", "2027-01-04"), noActionBefore: 4 },
  { id: "L13 control: next Friday", steps: ["I want a cleaning", "yes", "next Friday at 2pm", "Trevor 2428012847"], final: finalBooking("Trevor", "14:00", "2026-10-16"), noActionBefore: 4 },
  { id: "L14 ambiguous 'at 3' must clarify", steps: ["I want a cleaning", "yes", "Tuesday at 3"], checkAfter: { 2: (t) => (t.actionsTaken.some((a) => a.action.type === "request_appointment") ? ["booked on an ambiguous time"] : []) }, final: (p) => (p.length === 0 ? [] : ["request_appointment issued for an ambiguous time"]) },
  { id: "L15 repeated yes -> at most one action", steps: [...BASE, "Trevor 2428012847", "yes", "yes"], final: (p) => (p.length <= 1 ? [] : [`${p.length} request_appointment actions from repeated yes`]) },
];

async function runCase(c: Case, pass: number): Promise<CaseResult> {
  setClock(c.clock ?? FRI);
  const agent = new ReceptionistAgent(new LLMProvider(new CappedClient()), createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE));
  const conv = new TortureConversation(agent);
  const res: CaseResult = { id: c.id, pass, steps: [], payloads: [], hard: [], soft: [] };
  try {
    for (let i = 0; i < c.steps.length; i++) {
      const t = await conv.say(c.steps[i]);
      if (haltedReason) throw new BudgetExceeded(haltedReason);
      res.steps.push({ in: c.steps[i], reply: t.reply.slice(0, 240), state: { ...t.bookingState } as Record<string, unknown> });
      const reqNow = conv.turns.flatMap((x) => x.actionsTaken).filter((a) => a.action.type === "request_appointment");
      if (c.noActionBefore !== undefined && i + 1 < c.noActionBefore && reqNow.length) res.hard.push(`booking executed at step ${i + 1} before explicit confirmation`);
      const chk = c.checkAfter?.[i];
      if (chk) res.hard.push(...chk(t));
    }
    // explicit confirmation(s): up to two "yes" until a booking occurs
    if (c.final && c.noActionBefore !== undefined) {
      for (let k = 0; k < 2; k++) {
        if (conv.turns.flatMap((x) => x.actionsTaken).some((a) => a.action.type === "request_appointment")) break;
        const t = await conv.say("yes");
        if (haltedReason) throw new BudgetExceeded(haltedReason);
        res.steps.push({ in: "yes", reply: t.reply.slice(0, 240), state: { ...t.bookingState } as Record<string, unknown> });
      }
    }
    res.payloads = conv.turns.flatMap((x) => x.actionsTaken).filter((a) => a.action.type === "request_appointment").map((a) => (a.action as unknown as { payload: Payload }).payload);
    const f = c.final?.(res.payloads, conv) ?? [];
    // a missing booking is a conversation-flow shortfall (soft); a WRONG payload/state is a hard failure
    for (const m of f) (m.startsWith("expected exactly 1") && res.payloads.length === 0 ? res.soft : res.hard).push(m);
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    res.error = e instanceof Error ? e.message : String(e);
    res.soft.push(`error: ${res.error.slice(0, 160)}`);
  }
  return res;
}

(async () => {
  const results: CaseResult[] = [];
  let stoppedBy: string | null = null;
  let passCost = 0;
  try {
    for (let pass = 1; pass <= PASSES; pass++) {
      const before = spent;
      if (pass > 1 && spent + passCost * 1.25 > CAP) { stoppedBy = `pass ${pass} skipped: projected $${(passCost * 1.25).toFixed(3)} would exceed the cap (spent $${spent.toFixed(4)})`; break; }
      for (const c of CASES) {
        const r = await runCase(c, pass);
        results.push(r);
        process.stdout.write(`pass ${pass} ${c.id}: ${r.hard.length ? "HARD-FAIL" : r.soft.length ? "soft" : "ok"}  spent=$${spent.toFixed(4)}\n`);
      }
      passCost = Math.max(passCost, spent - before);
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) stoppedBy = `BUDGET GATE: ${e.message}`;
    else throw e;
  }
  const hard = results.filter((r) => r.hard.length), soft = results.filter((r) => !r.hard.length && r.soft.length);
  const summary = {
    model: [...modelsSeen], requestedModel: MODEL, clock: "fixed per case (Fri 2026-10-09T16:00Z unless noted)", toolBackend: "simulated (no DB/WhatsApp/calendar)",
    capUSD: CAP, spentUSD: Number(spent.toFixed(4)), calls, inputTokens: inTok, outputTokens: outTok, stoppedBy,
    caseRuns: results.length, hardFailures: hard.length, softShortfalls: soft.length,
  };
  writeFileSync("/private/tmp/claude-501/live-eval-results.json", JSON.stringify({ summary, results }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  for (const r of hard) console.log("HARD", r.id, "pass", r.pass, r.hard);
  for (const r of soft) console.log("SOFT", r.id, "pass", r.pass, r.soft);
})();
