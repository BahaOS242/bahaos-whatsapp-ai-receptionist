import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { AIProvider, BookingState, ConversationTurn } from "../../src/ai/types";
import type { EvalTranscript, EvalTurnRecord } from "../eval/types";
import type { ConvScenario } from "./types";

/**
 * Conversation driver with two customer modes.
 *
 * "fixed"    — the scripted customer turns, in order, nothing else.
 * "adaptive" — the same scripted turns, plus a BOUNDED responsive layer: when
 *   the receptionist asks a clarification question for a fact the customer
 *   has not yet provided and the next scripted turn would not provide it,
 *   the customer first answers with the scenario's EXPECTED fact. Rules:
 *   - fields the scenario deliberately corrects are left to the script unless
 *     no remaining scripted turn would ever provide them;
 *   - it only ever supplies facts already fixed in the scenario's expected
 *     booking payload (it cannot change an expected fact);
 *   - it NEVER approves: no yes / confirmation is injected, ever; approval
 *     happens only on scripted turns;
 *   - at most 3 injected turns per conversation, at most 2 per fact;
 *   - never injected during a staff handoff, on a confirmation prompt, or
 *     for scenarios that expect no booking.
 */
export type Mode = "fixed" | "adaptive";

export interface DriveTurn extends EvalTurnRecord {
  /** Index into the scenario's scripted turns; undefined for injected turns. */
  scriptIndex?: number;
  /** Set on adaptive-customer turns: which fact(s) were supplied. */
  injected?: string[];
}
export interface DriveTranscript extends EvalTranscript {
  turns: DriveTurn[];
  mode: Mode;
}

/** Fixed business instant: Thursday 2026-08-20 11:00 in Nassau (matches
 * tests/helpers/pin-clock.ts so the reference calendar is in range). */
export const PINNED_NOW = new Date("2026-08-20T15:00:00Z");
const RealDate = Date;
export function pinClock(): () => void {
  const pinned = PINNED_NOW.getTime();
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(pinned);
      else super(...(args as [number]));
    }
    static now() {
      return pinned;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
  return () => {
    (globalThis as { Date: DateConstructor }).Date = RealDate;
  };
}

type Field = "name" | "phone" | "service" | "date" | "time";
export const ASKS: [Field, RegExp][] = [
  ["name", /\b(your name|name and (phone|number)|may i have (your )?name)\b/i],
  ["phone", /\b(phone number|number to reach|contact number|name and (phone|number))\b/i],
  [
    "service",
    /\b(which service|what service|service would you like|what are you coming in for)\b/i,
  ],
  ["date", /\b(what day|which day|day works|day and time|what date)\b/i],
  ["time", /\b(what time|time works|am\/pm|day and time)\b/i],
];
export const PROVIDES: Record<Field, (t: string, v: string) => boolean> = {
  name: (t, v) => t.toLowerCase().includes(v.split(" ")[0].toLowerCase()),
  phone: (t, v) => t.replace(/\D/g, "").includes(v.replace(/\D/g, "").slice(-7)),
  service: (t) => /clean|fill|consult|exam|check-?up|root canal/i.test(t),
  date: (t) => /\b(mon|tue|wed|thu|fri|sat|sun)\w*|today|tomorrow|tmrw|next week/i.test(t),
  // a bare "9:30" does not answer an am/pm clarification
  time: (t) => /\d\s?(am|pm)|noon/i.test(t),
};

function spoken(field: Field, v: string): string {
  if (field === "time") {
    const [h, m] = v.split(":").map(Number);
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
  }
  if (field === "phone") return v.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  if (field === "service") {
    return /clean/i.test(v)
      ? "a cleaning"
      : /fill/i.test(v)
        ? "a filling"
        : /consult/i.test(v)
          ? "a consultation"
          : v;
  }
  return v;
}

function factsOf(s: ConvScenario): Partial<Record<Field, string>> {
  if (s.expect.bookings !== 1) return {};
  const p = (s.expect.actions?.[0]?.payload ?? {}) as Record<string, string>;
  return {
    name: p.name,
    phone: p.phone,
    service: p.service,
    date: p.preferredDate,
    time: p.preferredTime,
  };
}

export function injectionFor(
  s: ConvScenario,
  reply: string,
  state: BookingState,
  remaining: string[],
  used: Map<Field, number>,
  total: number,
): { text: string; fields: Field[] } | null {
  if (total >= 3) return null;
  if (/reply yes|to confirm|is that correct/i.test(reply)) return null;
  const facts = factsOf(s);
  const asked = ASKS.filter(([, re]) => re.test(reply)).map(([f]) => f);
  const missing = [...new Set(asked)].filter((f) => {
    const v = facts[f];
    if (!v) return false;
    if ((used.get(f) ?? 0) >= 2) return false;
    if (state[f]) return false;
    // Fields the scenario itself corrects are owned by the script: only fill them
    // in if no remaining scripted turn will ever provide them. Other fields are
    // filled when the very next scripted turn would not provide them.
    const corrected = (s.expect.corrections ?? []).some((c) => (c.fields as string[]).includes(f));
    const upcoming = corrected ? remaining : remaining.slice(0, 1);
    if (upcoming.some((t) => PROVIDES[f](t, v))) return false;
    return true;
  });
  if (!missing.length) return null;
  const order: Field[] = ["service", "name", "phone", "date", "time"];
  const fields = order.filter((f) => missing.includes(f));
  return { text: fields.map((f) => spoken(f, facts[f] as string)).join(" "), fields };
}

export async function drive(
  s: ConvScenario,
  mode: Mode,
  provider: AIProvider = new DevRuleBasedAIProvider(),
): Promise<DriveTranscript> {
  const business = BAHAMAS_DENTAL_SERVICE;
  const agent = new ReceptionistAgent(provider, createSimulatedReceptionistTools(business));
  const manager = new ConversationManager();
  const history: ConversationTurn[] = [];
  const turns: DriveTurn[] = [];
  const used = new Map<Field, number>();
  let injections = 0;

  const send = async (message: string, extra: Partial<DriveTurn>) => {
    const request = manager.buildRequest({ business, customer: {}, history, message });
    const result = await agent.handleMessage(request);
    turns.push({
      input: message,
      reply: result.reply,
      bookingState: result.bookingState,
      safetyOverride: result.safetyOverride,
      handoffActive: result.handoffActive,
      actionsTaken: result.actionsTaken,
      ...extra,
    });
    history.push(
      { role: "customer", content: message },
      { role: "assistant", content: result.reply },
    );
    manager.setBookingState(result.bookingState);
    manager.setHandoffActive(result.handoffActive);
    return result;
  };

  for (let i = 0; i < s.turns.length; i++) {
    const result = await send(s.turns[i], { scriptIndex: i });
    if (mode === "adaptive" && i < s.turns.length - 1 && !result.handoffActive) {
      const inj = injectionFor(
        s,
        result.reply,
        result.bookingState,
        s.turns.slice(i + 1),
        used,
        injections,
      );
      if (inj) {
        injections++;
        inj.fields.forEach((f) => used.set(f, (used.get(f) ?? 0) + 1));
        await send(inj.text, { injected: inj.fields });
      }
    }
  }
  const last = turns[turns.length - 1];
  return {
    scenarioId: s.id,
    mode,
    turns,
    finalState: last?.bookingState ?? {},
    allActions: turns.flatMap((t) => t.actionsTaken),
    finalHandoffActive: last?.handoffActive ?? false,
  };
}
