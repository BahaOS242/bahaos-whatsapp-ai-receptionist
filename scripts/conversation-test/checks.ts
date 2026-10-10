import type { EvalTranscript } from "../eval/types";
import type { BookingState } from "../../src/ai/types";
import type { ConvScenario } from "./types";

/**
 * Independent validators. They read ONLY the recorded transcript
 * (customer input, reply text, structured state, executed actions) and the
 * scenario's expectations. They never look at, replay, or compare against
 * any source-dialog assistant reply.
 */
export interface Finding {
  check: string;
  turn?: number;
  detail: string;
}

const AFFIRM =
  /^\s*(yes|yeah|yep|yup|ok(ay)?|sure|please do|go ahead|that'?s (right|correct|fine)|correct|confirm)\b/i;
const CONFIGURED_PRICES = new Set(["75", "125", "175", "950"]);
const FOREIGN_DOMAIN =
  /\b(oil change|tire|brake|mechanic|garage|vehicle|restaurant|reservation|party of|menu)\b/i;
const FALSE_CLAIM =
  /(you(?:'| a)re (all )?(set|booked|confirmed)|has been (booked|confirmed|scheduled)|is (now )?confirmed|i(?:'ve| have) (booked|scheduled|confirmed))/i;
const DETAIL_FIELDS: (keyof BookingState)[] = ["service", "name", "phone", "date", "time"];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function runChecks(scenario: ConvScenario, t: EvalTranscript): Finding[] {
  const out: Finding[] = [];
  const completing = (i: number) =>
    t.turns[i].actionsTaken.filter(
      (a) => a.action.type === "request_appointment" && a.result.success,
    );

  // 1. exactly the expected number of bookings
  const bookings = t.allActions.filter(
    (a) => a.action.type === "request_appointment" && a.result.success,
  );
  if (bookings.length !== scenario.expect.bookings) {
    out.push({
      check: "booking-count",
      detail: `expected exactly ${scenario.expect.bookings} successful booking action(s), got ${bookings.length}`,
    });
  }

  // 2. confirmation is a separate, explicit step before any booking action
  t.turns.forEach((turn, i) => {
    if (!completing(i).length) return;
    const prev = i > 0 ? t.turns[i - 1].bookingState : {};
    if (prev.pendingAction !== "confirm_booking") {
      out.push({
        check: "separate-confirmation",
        turn: i,
        detail: "booking executed without a prior confirmation summary awaiting YES",
      });
    }
    if (!AFFIRM.test(turn.input)) {
      out.push({
        check: "separate-confirmation",
        turn: i,
        detail: `booking executed on a non-affirmative message: "${turn.input}"`,
      });
    }
  });

  // 3. no false completion claims
  t.turns.forEach((turn, i) => {
    if (FALSE_CLAIM.test(turn.reply) && !completing(i).length) {
      out.push({
        check: "false-claim",
        turn: i,
        detail: `reply claims booking/confirmation with no successful booking action: "${turn.reply}"`,
      });
    }
  });

  // 4. repeated identical replies (generic question loop)
  for (let i = 1; i < t.turns.length; i++) {
    if (t.turns[i - 1].handoffActive) continue; // staff-handoff holding reply is intentionally stable
    if (
      norm(t.turns[i].reply) === norm(t.turns[i - 1].reply) &&
      norm(t.turns[i].reply).length > 0
    ) {
      out.push({
        check: "repeated-reply",
        turn: i,
        detail: `identical reply on consecutive turns: "${t.turns[i].reply}"`,
      });
    }
  }

  // 5. validated details must not be lost unless the scenario allows the change
  const allowed = new Map<number, Set<string>>();
  scenario.expect.corrections?.forEach((c) => allowed.set(c.turn, new Set(c.fields as string[])));
  const known: Partial<Record<keyof BookingState, unknown>> = {};
  t.turns.forEach((turn, i) => {
    if (completing(i).length) return;
    const ok = allowed.get(i) ?? new Set<string>();
    const resetsAll = scenario.expect.outcome === "abandoned" && i === t.turns.length - 1;
    const intentCleared = !turn.bookingState.intent && Object.keys(known).length > 0;
    for (const f of DETAIL_FIELDS) {
      const now = turn.bookingState[f];
      if (
        known[f] !== undefined &&
        now !== known[f] &&
        !ok.has(f) &&
        !resetsAll &&
        !intentCleared
      ) {
        out.push({
          check: "detail-loss",
          turn: i,
          detail: `${f} changed from ${JSON.stringify(known[f])} to ${JSON.stringify(now)} without a customer correction`,
        });
      }
      if (now !== undefined) known[f] = now;
      else if (ok.has(f) || resetsAll || intentCleared) delete known[f];
    }
  });

  // 6. no unsafe guesses: unconfigured prices, foreign-domain talk
  t.turns.forEach((turn, i) => {
    for (const m of turn.reply.matchAll(/(?:B?\$)\s?(\d[\d,]*)/g)) {
      if (!CONFIGURED_PRICES.has(m[1].replace(/,/g, ""))) {
        out.push({
          check: "unconfigured-price",
          turn: i,
          detail: `reply states an unconfigured amount "${m[0]}"`,
        });
      }
    }
    if (
      FOREIGN_DOMAIN.test(turn.reply) &&
      !/we offer|don't offer|do not offer|not (something|a service)|can't help with/i.test(
        turn.reply,
      )
    ) {
      out.push({
        check: "foreign-domain",
        turn: i,
        detail: `reply mentions an unsupported domain term: "${turn.reply}"`,
      });
    }
  });

  // 7. per-scenario reply checks
  for (const rc of scenario.expect.replyChecks ?? []) {
    const reply = t.turns[rc.turn]?.reply;
    if (reply === undefined) {
      out.push({
        check: "reply-check",
        turn: rc.turn,
        detail: `no reply recorded for turn ${rc.turn} (${rc.why})`,
      });
      continue;
    }
    for (const re of rc.mustMatch ?? []) {
      if (!new RegExp(re, "i").test(reply)) {
        out.push({
          check: "reply-must-match",
          turn: rc.turn,
          detail: `${rc.why}: reply did not match /${re}/ — "${reply}"`,
        });
      }
    }
    for (const re of rc.mustNotMatch ?? []) {
      if (new RegExp(re, "i").test(reply)) {
        out.push({
          check: "reply-must-not-match",
          turn: rc.turn,
          detail: `${rc.why}: reply matched forbidden /${re}/ — "${reply}"`,
        });
      }
    }
  }

  // 8. escalation scenarios: no booking attempt
  if (scenario.expect.outcome === "escalated" && bookings.length > 0) {
    out.push({ check: "escalation-booking", detail: "booked despite an emergency handoff" });
  }
  return out;
}
