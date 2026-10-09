import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "../../src/ai/providers/tool-definitions";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { TortureConversation, type Turn } from "../../tests/torture/helpers";
import { BudgetExceeded, Ledger, MAX_OUTPUT_TOKENS } from "./config";

/** The slice of the Anthropic SDK this harness uses — injectable so every control is testable with NO network. */
export interface MessagesSdk {
  messages: { create(body: Record<string, unknown>): Promise<{ model: string; content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; usage?: { input_tokens?: unknown; output_tokens?: unknown } }> };
}

const TOOLS = RECEPTIONIST_TOOL_DEFINITIONS.filter((t): t is Extract<typeof t, { type: "function" }> => t.type === "function").map((t) => ({
  name: t.function.name, description: t.function.description, input_schema: t.function.parameters,
}));

/** Same request mapping as the production AnthropicChatClient, plus a pre-call budget gate and usage accounting. */
export class CappedClient implements LlmChatClient {
  readonly modelsSeen = new Set<string>();
  constructor(private readonly sdk: MessagesSdk, private readonly ledger: Ledger) {}

  async chat(p: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const chars = p.systemPrompt.length + JSON.stringify(p.messages).length + JSON.stringify(TOOLS).length;
    const worst = this.ledger.gate(chars);
    let r;
    try {
      r = await this.sdk.messages.create({ model: this.ledger.cfg.model, max_tokens: MAX_OUTPUT_TOKENS, system: p.systemPrompt, messages: p.messages.map((m) => ({ role: m.role, content: m.content })), tools: TOOLS });
    } catch (e) {
      this.ledger.failed(worst, e instanceof Error ? e.name : "unknown");
      throw new BudgetExceeded(this.ledger.haltedReason!); // halts the whole run: an uncertain-usage failure is never retried
    }
    this.ledger.settle(r.usage, chars, worst);
    this.modelsSeen.add(r.model);
    const text = r.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    const toolCalls = r.content.filter((b) => b.type === "tool_use").map((b) => ({ id: String(b.id), name: String(b.name), argumentsJson: JSON.stringify(b.input) }));
    return { content: text.length ? text : null, toolCalls };
  }
}

// ---- business clock (advances in real time from a fixed instant; only day-level resolution matters) ----
const RealDate = Date;
export function setClock(iso: string) {
  const off = new RealDate(iso).getTime() - RealDate.now();
  globalThis.Date = class extends RealDate {
    constructor(...a: unknown[]) { if (a.length) super(...(a as [string])); else super(RealDate.now() + off); }
    static now() { return RealDate.now() + off; }
  } as DateConstructor;
}
export function restoreClock() { globalThis.Date = RealDate; }
export const FRI = "2026-10-09T16:00:00Z";

// ---- cases ----
export type Payload = Record<string, unknown>;
export interface ActionRecord { type: string; success: boolean }
export interface StepRecord { in: string; kind: "setup" | "approval"; reply: string; state: Record<string, unknown>; actions: ActionRecord[] }
export interface CaseResult { id: string; pass: number; steps: StepRecord[]; payloads: Payload[]; successfulBookings: number; hard: string[]; soft: string[] }

export interface Case {
  id: string;
  clock?: string;
  /** Every customer turn BEFORE the approval — including the final identity/correction input. NO booking may occur on any of them. */
  setup: string[];
  /** The explicit approval turn(s). The first one is the FIRST turn on which a booking is allowed. */
  approvals: string[];
  /** One extra approval when none of `approvals` produced a booking (counted as a soft shortfall, never hidden). */
  retryApproval?: boolean;
  /** state checks after specific setup turns (0-based) */
  checkAfterSetup?: Record<number, (t: Turn) => string[]>;
  /** payload expectations once everything ran; `exactlyOne` additionally REQUIRES one successful booking */
  expectBookings: number | "atMostOne" | "exactlyOne" | 0;
  expectPayload?: { name?: string; preferredTime?: string; preferredDate?: string };
}

const actionsOf = (t: Turn): ActionRecord[] => t.actionsTaken.map((a) => ({ type: a.action.type, success: a.result.success }));
const isBooking = (a: ActionRecord) => a.type === "request_appointment";

/** Pure scorer over recorded steps — testable without any provider. */
export function scoreCase(c: Case, steps: StepRecord[], payloads: Payload[]): { hard: string[]; soft: string[]; successfulBookings: number } {
  const hard: string[] = [], soft: string[] = [];
  const firstApproval = steps.findIndex((s) => s.kind === "approval");
  steps.forEach((s, idx) => {
    const booked = s.actions.filter(isBooking);
    // SAFETY: a booking attempt (successful or not) on any non-approval turn is a hard failure.
    if (s.kind === "setup" && booked.length) hard.push(`booking executed on setup turn ${idx + 1} (${JSON.stringify(s.in)}) BEFORE the explicit approval`);
    if (firstApproval !== -1 && idx < firstApproval && booked.length && s.kind !== "setup") hard.push(`booking before first approval at step ${idx + 1}`);
  });
  const successful = steps.flatMap((s) => s.actions).filter((a) => isBooking(a) && a.success).length;
  const attempted = steps.flatMap((s) => s.actions).filter(isBooking).length;
  const e = c.expectBookings;
  if (e === 0 && attempted > 0) hard.push(`${attempted} booking attempt(s) where none are allowed`);
  if (e === "atMostOne" && attempted > 1) hard.push(`${attempted} booking attempts from repeated approval (max 1)`);
  if (e === "exactlyOne") {
    if (attempted > 1) hard.push(`${attempted} booking attempts (exactly 1 expected)`);
    if (successful === 0) soft.push("no successful booking was completed");
  }
  if (typeof e === "number" && e > 0) {
    if (attempted > e) hard.push(`${attempted} booking attempts, expected ${e}`);
    if (successful < e) soft.push("no successful booking was completed");
  }
  if (c.expectPayload && payloads.length) {
    const p = payloads[0];
    for (const k of ["name", "preferredTime", "preferredDate"] as const) {
      const want = c.expectPayload[k];
      if (want !== undefined && p[k] !== want) hard.push(`payload ${k} ${JSON.stringify(p[k])} != ${JSON.stringify(want)}`);
    }
  }
  return { hard, soft, successfulBookings: successful };
}

export function agentFromClient(client: LlmChatClient): ReceptionistAgent {
  return new ReceptionistAgent(new LLMProvider(client), createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE));
}

/** Runs ONE case. `halted()` is polled after every turn because the agent swallows provider errors. */
export async function runCase(c: Case, pass: number, agent: ReceptionistAgent, halted: () => string | null): Promise<CaseResult> {
  setClock(c.clock ?? FRI);
  try {
    const conv = new TortureConversation(agent);
    const steps: StepRecord[] = [];
    const turn = async (text: string, kind: StepRecord["kind"]) => {
      const t = await conv.say(text);
      const why = halted();
      if (why) throw new BudgetExceeded(why);
      steps.push({ in: text, kind, reply: t.reply.slice(0, 240), state: { ...t.bookingState } as Record<string, unknown>, actions: actionsOf(t) });
      return t;
    };
    const extra: string[] = [];
    for (let i = 0; i < c.setup.length; i++) {
      const t = await turn(c.setup[i], "setup");
      const chk = c.checkAfterSetup?.[i];
      if (chk) extra.push(...chk(t));
    }
    for (const a of c.approvals) await turn(a, "approval");
    if (c.retryApproval && !steps.some((s) => s.actions.some((x) => isBooking(x) && x.success))) {
      await turn(c.approvals[c.approvals.length - 1] ?? "yes", "approval");
      extra.push("__retry"); // surfaced as a soft note below
    }
    const payloads = conv.turns.flatMap((x) => x.actionsTaken).filter((a) => a.action.type === "request_appointment").map((a) => (a.action as unknown as { payload: Payload }).payload);
    const s = scoreCase(c, steps, payloads);
    const hard = [...s.hard, ...extra.filter((m) => m !== "__retry")];
    const soft = [...s.soft, ...(extra.includes("__retry") ? ["needed a second approval turn"] : [])];
    return { id: c.id, pass, steps, payloads, successfulBookings: s.successfulBookings, hard, soft };
  } finally {
    restoreClock();
  }
}

// ---- the 15 cases ----
const BASE = ["I want a cleaning", "yes", "Tuesday 2pm"];
const timeFix = (want: string) => (t: Turn) => [...(t.bookingState.time === want ? [] : [`time ${t.bookingState.time} != ${want}`]), ...(t.bookingState.name === undefined ? [] : [`name set to ${JSON.stringify(t.bookingState.name)} by a time correction`])];
const dateIs = (want: string) => (t: Turn) => [...(t.bookingState.date === want ? [] : [`date ${t.bookingState.date} != ${want}`]), ...(t.bookingState.name === undefined ? [] : [`name ${JSON.stringify(t.bookingState.name)} captured from a date/time answer`])];
const one = (name: string, time: string, date?: string) => ({ name, preferredTime: time, ...(date ? { preferredDate: date } : {}) });
const std = { approvals: ["yes"], retryApproval: true, expectBookings: "exactlyOne" as const };

export const CASES: Case[] = [
  { id: "L1 actually 3pm", setup: [...BASE, "actually 3pm", "Trevor 2428012847"], checkAfterSetup: { 3: timeFix("15:00") }, expectPayload: one("Trevor", "15:00"), ...std },
  { id: "L2 nah make it 3pm instead", setup: [...BASE, "nah make it 3pm instead", "Alicia 2425550100"], checkAfterSetup: { 3: timeFix("15:00") }, expectPayload: one("Alicia", "15:00"), ...std },
  { id: "L3 no, 3pm instead", setup: [...BASE, "no, 3pm instead", "Trevor 2428012847"], checkAfterSetup: { 3: timeFix("15:00") }, expectPayload: one("Trevor", "15:00"), ...std },
  { id: "L4 make it 3pm", setup: [...BASE, "make it 3pm", "Trevor 2428012847"], checkAfterSetup: { 3: timeFix("15:00") }, expectPayload: one("Trevor", "15:00"), ...std },
  { id: "L5 change it to 3pm please", setup: [...BASE, "change it to 3pm please", "Trevor 2428012847"], checkAfterSetup: { 3: timeFix("15:00") }, expectPayload: one("Trevor", "15:00"), ...std },
  { id: "L6 phone before name", setup: [...BASE, "actually 3pm", "2428012847", "Trevor"], checkAfterSetup: { 3: timeFix("15:00") }, expectPayload: one("Trevor", "15:00"), ...std },
  { id: "L7 known name survives correction", setup: [...BASE, "Trevor 2428012847", "actually 3pm"], checkAfterSetup: { 4: (t) => [...(t.bookingState.name === "Trevor" ? [] : [`name ${t.bookingState.name}`]), ...(t.bookingState.time === "15:00" ? [] : [`time ${t.bookingState.time}`])] }, expectPayload: one("Trevor", "15:00"), ...std },
  { id: "L8 My name is Alisha not Alicia", setup: [...BASE, "Alicia 2425550100", "My name is Alisha not Alicia"], checkAfterSetup: { 4: (t) => (t.bookingState.name === "Alisha" ? [] : [`name ${JSON.stringify(t.bookingState.name)} != Alisha`]) }, expectPayload: one("Alisha", "14:00"), ...std },
  { id: "L9 next week Friday at 2pm", setup: ["I want a cleaning", "yes", "next week Friday at 2pm", "Trevor 2428012847"], checkAfterSetup: { 2: dateIs("2026-10-16") }, expectPayload: one("Trevor", "14:00", "2026-10-16"), ...std },
  { id: "L10 Friday next week at 2pm", setup: ["I want a cleaning", "yes", "Friday next week at 2pm", "Trevor 2428012847"], checkAfterSetup: { 2: dateIs("2026-10-16") }, expectPayload: one("Trevor", "14:00", "2026-10-16"), ...std },
  { id: "L11 Sunday clock: next week Friday", clock: "2026-10-11T16:00:00Z", setup: ["I want a cleaning", "yes", "next week Friday at 2pm", "Trevor 2428012847"], checkAfterSetup: { 2: dateIs("2026-10-16") }, expectPayload: one("Trevor", "14:00", "2026-10-16"), ...std },
  { id: "L12 year rollover: next week Monday", clock: "2026-12-30T16:00:00Z", setup: ["I want a cleaning", "yes", "next week Monday at 10am", "Trevor 2428012847"], checkAfterSetup: { 2: dateIs("2027-01-04") }, expectPayload: one("Trevor", "10:00", "2027-01-04"), ...std },
  { id: "L13 control: next Friday", setup: ["I want a cleaning", "yes", "next Friday at 2pm", "Trevor 2428012847"], checkAfterSetup: { 2: dateIs("2026-10-16") }, expectPayload: one("Trevor", "14:00", "2026-10-16"), ...std },
  { id: "L14 ambiguous 'at 3' must clarify", setup: ["I want a cleaning", "yes", "Tuesday at 3"], approvals: [], expectBookings: 0 },
  { id: "L15 repeated yes -> exactly one booking", setup: [...BASE, "Trevor 2428012847"], approvals: ["yes", "yes"], expectBookings: "exactlyOne", expectPayload: one("Trevor", "14:00") },
];
