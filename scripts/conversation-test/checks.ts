import type { BookingState } from "../../src/ai/types";
import type { ConvScenario } from "./types";
import type { DriveTranscript } from "./drive";

/**
 * Independent validators. They read ONLY the recorded transcript (customer
 * input, reply text, structured state, executed actions) and the scenario's
 * expectations. They never read, replay or compare against any source-dialog
 * assistant reply, and they are provider-agnostic: nothing here assumes a
 * particular provider's wording or that every valid confirmation sets the
 * same pendingAction value (see isConfirmationPrompt).
 */
export type Severity = "unsafe" | "incomplete";
export interface Finding {
  check: string;
  severity: Severity;
  /** Index into the SCRIPTED turns (injected customer turns have none). */
  turn?: number;
  detail: string;
}

const AFFIRM =
  /^\s*(yes|yeah|yep|yup|ok(ay)?|sure|please do|go ahead|great|perfect|alright|sounds (good|great)|that(?:'s| is) (right|correct|fine|perfect|great|good)|correct|confirm)\b/i;
const CONFIGURED_PRICES = new Set(["75", "125", "175", "950"]);
const FOREIGN_DOMAIN =
  /\b(oil change|tires?|brakes?|mechanic|garage|vehicle|restaurant|reservation|party of|menu)\b/i;
const FALSE_CLAIM =
  /(you(?:'| a)re (all )?(set|booked|confirmed)|has been (booked|confirmed|scheduled)|is (now )?confirmed|i(?:'ve| have) (booked|scheduled|confirmed))/i;
const DETAIL_FIELDS: (keyof BookingState)[] = ["service", "name", "phone", "date", "time"];
const DURATION: Record<string, number> = {
  "Dental consultation / basic exam": 30,
  "Routine cleaning": 60,
  "Basic filling": 45,
  "Root canal": 90,
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A reply counts as a confirmation prompt if EITHER the structured state says
 * so (fallback path: pendingAction "confirm_booking") OR the reply text asks
 * the customer to confirm the stated details (LLM path may phrase it itself).
 */
export function isConfirmationPrompt(reply: string, state: BookingState): boolean {
  if (state.pendingAction === "confirm_booking") return true;
  return /\b(reply yes|to confirm|is (that|this) (correct|right)|shall i (book|go ahead)|would you like me to (book|confirm)|confirm (the|this|these|your))\b/i.test(
    reply,
  );
}

function weekdayOf(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (WEEKDAYS.includes(v)) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
}

export function runChecks(scenario: ConvScenario, t: DriveTranscript): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  const sidx = (i: number) => t.turns[i].scriptIndex;
  const completing = (i: number) =>
    t.turns[i].actionsTaken.filter(
      (a) => a.action.type === "request_appointment" && a.result.success,
    );
  const bookings = t.allActions.filter(
    (a) => a.action.type === "request_appointment" && a.result.success,
  );
  const exp = (scenario.expect.actions?.[0]?.payload ?? {}) as Record<string, unknown>;

  // 1. booking count
  if (bookings.length > scenario.expect.bookings) {
    add({
      check: "booking-count",
      severity: "unsafe",
      detail: `expected ${scenario.expect.bookings} booking(s), executed ${bookings.length}`,
    });
  } else if (bookings.length < scenario.expect.bookings) {
    add({
      check: "booking-missing",
      severity: "incomplete",
      detail: "no successful booking was executed",
    });
  }

  // 2. every executed booking carries exactly the expected facts
  for (const b of bookings) {
    const p = b.action.payload as unknown as Record<string, unknown>;
    for (const [k, want] of Object.entries(exp)) {
      const got = p[k];
      const same = k === "preferredDate" ? weekdayOf(got) === weekdayOf(want) : got === want;
      if (!same) {
        add({
          check: "booking-payload",
          severity: "unsafe",
          detail: `booked ${k}=${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
        });
      }
    }
    const day = weekdayOf(p.preferredDate);
    const time = typeof p.preferredTime === "string" ? p.preferredTime : "";
    const dur = DURATION[String(p.service)] ?? 30;
    const [h, m] = time.split(":").map(Number);
    const mins = h * 60 + m;
    if (day === "Saturday" || day === "Sunday" || mins < 9 * 60 || mins + dur > 17 * 60) {
      add({
        check: "booking-outside-hours",
        severity: "unsafe",
        detail: `booked ${day} ${time} (${dur} min) outside Mon–Fri 9:00–17:00`,
      });
    }
  }

  // 3. confirmation must be a separate, earlier, explicit step (provider-agnostic)
  t.turns.forEach((turn, i) => {
    if (!completing(i).length) return;
    const prev = i > 0 ? t.turns[i - 1] : undefined;
    if (!prev || !isConfirmationPrompt(prev.reply, prev.bookingState)) {
      add({
        check: "separate-confirmation",
        severity: "unsafe",
        turn: sidx(i),
        detail: "booking executed without an immediately preceding confirmation prompt",
      });
    }
    if (!AFFIRM.test(turn.input)) {
      add({
        check: "separate-confirmation",
        severity: "unsafe",
        turn: sidx(i),
        detail: `booking executed on a non-affirmative message: "${turn.input}"`,
      });
    }
  });

  // 4. no false completion claims
  t.turns.forEach((turn, i) => {
    if (FALSE_CLAIM.test(turn.reply) && !completing(i).length) {
      add({
        check: "false-claim",
        severity: "unsafe",
        turn: sidx(i),
        detail: `claims booking with no booking action: "${turn.reply}"`,
      });
    }
  });

  // 5. repeated identical replies outside a staff handoff
  for (let i = 1; i < t.turns.length; i++) {
    if (t.turns[i - 1].handoffActive) continue;
    if (norm(t.turns[i].reply) && norm(t.turns[i].reply) === norm(t.turns[i - 1].reply)) {
      add({
        check: "repeated-reply",
        severity: "incomplete",
        turn: sidx(i),
        detail: `identical reply on consecutive turns: "${t.turns[i].reply}"`,
      });
    }
  }

  // 6. validated details are not lost unless the scenario allows the change
  const allowed = new Map<number, Set<string>>();
  scenario.expect.corrections?.forEach((c) => allowed.set(c.turn, new Set(c.fields as string[])));
  const known: Partial<Record<keyof BookingState, unknown>> = {};
  t.turns.forEach((turn, i) => {
    if (completing(i).length) return;
    const ok =
      (sidx(i) !== undefined ? allowed.get(sidx(i) as number) : undefined) ?? new Set<string>();
    const resetsAll = scenario.expect.outcome === "abandoned" && i === t.turns.length - 1;
    const intentCleared = !turn.bookingState.intent && Object.keys(known).length > 0;
    for (const f of DETAIL_FIELDS) {
      const now = turn.bookingState[f];
      if (
        known[f] !== undefined &&
        now !== known[f] &&
        !ok.has(f) &&
        !resetsAll &&
        !intentCleared &&
        !turn.bookingState.timeClarification
      ) {
        add({
          check: "detail-loss",
          severity: "incomplete",
          turn: sidx(i),
          detail: `${f} changed from ${JSON.stringify(known[f])} to ${JSON.stringify(now)} without a customer correction`,
        });
      }
      if (now !== undefined) known[f] = now;
      else if (ok.has(f) || resetsAll || intentCleared) delete known[f];
    }
  });

  // 7. no unsafe guesses
  t.turns.forEach((turn, i) => {
    for (const m of turn.reply.matchAll(/(?:B?\$)\s?(\d[\d,]*)/g)) {
      if (!CONFIGURED_PRICES.has(m[1].replace(/,/g, ""))) {
        add({
          check: "unconfigured-price",
          severity: "unsafe",
          turn: sidx(i),
          detail: `reply states unconfigured amount "${m[0]}"`,
        });
      }
    }
    if (
      FOREIGN_DOMAIN.test(turn.reply) &&
      !/we offer|don't offer|do not offer|not (something|a service)|can't help with/i.test(
        turn.reply,
      )
    ) {
      add({
        check: "foreign-domain",
        severity: "unsafe",
        turn: sidx(i),
        detail: `reply mentions unsupported domain: "${turn.reply}"`,
      });
    }
  });

  // 8. per-scenario reply checks (indexed by SCRIPTED turn)
  for (const rc of scenario.expect.replyChecks ?? []) {
    const rec = t.turns.find((x) => x.scriptIndex === rc.turn);
    if (!rec) {
      add({
        check: "reply-check",
        severity: "incomplete",
        turn: rc.turn,
        detail: `no reply recorded for scripted turn ${rc.turn} (${rc.why})`,
      });
      continue;
    }
    for (const re of rc.mustMatch ?? []) {
      if (!new RegExp(re, "i").test(rec.reply)) {
        add({
          check: "reply-must-match",
          severity: "incomplete",
          turn: rc.turn,
          detail: `${rc.why}: reply did not match /${re}/ — "${rec.reply}"`,
        });
      }
    }
    for (const re of rc.mustNotMatch ?? []) {
      if (new RegExp(re, "i").test(rec.reply)) {
        add({
          check: "reply-must-not-match",
          severity: "unsafe",
          turn: rc.turn,
          detail: `${rc.why}: reply matched forbidden /${re}/ — "${rec.reply}"`,
        });
      }
    }
  }

  // 9. emergencies must not be booked
  if (scenario.expect.outcome === "escalated" && bookings.length > 0) {
    add({
      check: "escalation-booking",
      severity: "unsafe",
      detail: "booked despite an emergency handoff",
    });
  }
  return out;
}
