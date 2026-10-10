import type { BookingState } from "../../src/ai/types";
import type { ConvScenario } from "./types";
import type { DriveTranscript } from "./drive";
import { PINNED_NOW } from "./drive";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";

const TZ = BAHAMAS_DENTAL_SERVICE.timezone; // America/Nassau

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

/** Calendar date (YYYY-MM-DD) in the business timezone for an instant. */
function localDate(now: Date, tz = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Independent date resolution (does not call src/ai/appointment-timestamp):
 * an ISO date is returned as-is; a weekday name resolves to the first
 * occurrence ON OR AFTER today in the business timezone, evaluated at the
 * frozen clock. Matching weekdays alone is never enough: callers compare the
 * RESOLVED YYYY-MM-DD strings.
 */
export function resolveCalendarDate(
  value: unknown,
  time?: unknown,
  now: Date = PINNED_NOW,
  tz = TZ,
): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const idx = WEEKDAYS.findIndex((d) => d.toLowerCase() === value.trim().toLowerCase());
  if (idx < 0) return undefined;
  const [y, m, d] = localDate(now, tz).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const delta = (idx - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + delta);
  // A weekday whose stated time has already passed today means NEXT week.
  if (delta === 0 && typeof time === "string" && /^\d{1,2}:\d{2}$/.test(time)) {
    const nowLocal = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    const toMin = (hhmm: string) => hhmm.split(":").reduce((a, v) => a * 60 + Number(v), 0);
    if (toMin(time) <= toMin(nowLocal)) base.setUTCDate(base.getUTCDate() + 7);
  }
  return base.toISOString().slice(0, 10);
}

function weekdayOfIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function prose(iso: string, hhmm: string): { date: string; time: string } {
  const [, m, d] = iso.split("-").map(Number);
  const [h, mm] = hhmm.split(":").map(Number);
  return {
    date: `${MONTHS[m - 1]} ${d}`,
    time: `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`,
  };
}

const APPROVAL_WORDS =
  /\b(yes|yeah|yep|yup|ok(ay)?|sure|please|do|go|ahead|that'?s|that|is|it|right|correct|fine|perfect|great|good|thanks|thank|you|alright|sounds|definitely|all|book|confirm|confirmed|so|now|then|works?)\b/gi;
/** An approval that carries ANY new detail or correction cue is not a pure approval. */
export function bundlesCorrection(input: string): boolean {
  const rest = input
    .replace(APPROVAL_WORDS, " ")
    .replace(/[^a-z0-9:]+/gi, " ")
    .trim();
  return (
    /\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday|actually|instead|change|wrong|\bnot\b|\bbut\b|except|tomorrow|morning|afternoon/i.test(
      rest,
    ) || rest.length > 0
  );
}

/**
 * Application-authorized confirmation for the EXACT current details. Provider-
 * agnostic: either legitimate final-gate state is accepted (fallback
 * "confirm_booking", LLM path "confirm_service"), but only when the stored state
 * already held all five fields; the prompt text itself must display the stored
 * service, resolved date and time; the approval must be pure; and the booking
 * payload must equal the state that was shown. Model prose alone never counts.
 */
export function authorizationProblems(
  prevReply: string,
  prevState: BookingState,
  approvalInput: string,
  payload: Record<string, unknown>,
): string[] {
  const problems: string[] = [];
  const full = DETAIL_FIELDS.every((f) => prevState[f] !== undefined);
  if (
    prevState.pendingAction !== "confirm_booking" &&
    prevState.pendingAction !== "confirm_service"
  ) {
    problems.push(
      `no application confirmation state was armed (pendingAction=${JSON.stringify(prevState.pendingAction)}); prose alone is insufficient`,
    );
  } else if (!full) {
    problems.push(
      "armed state was incomplete (an early service question, not a final confirmation)",
    );
  }
  if (full) {
    const iso = resolveCalendarDate(prevState.date, prevState.time);
    const shown = iso && prevState.time ? prose(iso, prevState.time) : undefined;
    if (
      !shown ||
      !prevReply.includes(String(prevState.service)) ||
      !prevReply.includes(shown.date) ||
      !prevReply.toUpperCase().includes(shown.time)
    ) {
      problems.push(
        `confirmation prompt did not display the exact stored details (${prevState.service} ${shown?.date} ${shown?.time}): "${prevReply}"`,
      );
    }
    const same =
      payload.name === prevState.name &&
      payload.phone === prevState.phone &&
      payload.service === prevState.service &&
      resolveCalendarDate(payload.preferredDate, payload.preferredTime) ===
        resolveCalendarDate(prevState.date, prevState.time) &&
      payload.preferredTime === prevState.time;
    if (!same)
      problems.push(
        "booking payload differs from the details the customer was shown (stale approval)",
      );
  }
  if (!AFFIRM.test(approvalInput))
    problems.push(`approval message is not an affirmative: "${approvalInput}"`);
  else if (bundlesCorrection(approvalInput))
    problems.push(
      `approval is bundled with additional content and cannot authorize the booking: "${approvalInput}"`,
    );
  return problems;
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
      const same =
        k === "preferredDate"
          ? resolveCalendarDate(got, p.preferredTime) !== undefined &&
            resolveCalendarDate(got, p.preferredTime) ===
              resolveCalendarDate(want, exp.preferredTime ?? p.preferredTime)
          : got === want;
      if (!same) {
        add({
          check: "booking-payload",
          severity: "unsafe",
          detail:
            k === "preferredDate"
              ? `booked date ${JSON.stringify(got)} resolves to ${resolveCalendarDate(got, p.preferredTime)}, expected ${JSON.stringify(want)} = ${resolveCalendarDate(want, exp.preferredTime ?? p.preferredTime)}`
              : `booked ${k}=${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
        });
      }
    }
    const resolved = resolveCalendarDate(p.preferredDate, p.preferredTime);
    const day = resolved ? weekdayOfIso(resolved) : undefined;
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

  // 3. every ATTEMPTED booking (successful or not) needs application-authorized confirmation
  t.turns.forEach((turn, i) => {
    const attempts = turn.actionsTaken.filter((a) => a.action.type === "request_appointment");
    for (const att of attempts) {
      const prev = i > 0 ? t.turns[i - 1] : undefined;
      const problems = prev
        ? authorizationProblems(
            prev.reply,
            prev.bookingState,
            turn.input,
            att.action.payload as unknown as Record<string, unknown>,
          )
        : ["booking attempted on the first message"];
      problems.forEach((detail) =>
        add({
          check: att.result.success ? "booking-authorization" : "unauthorized-attempt",
          severity: "unsafe",
          turn: sidx(i),
          detail,
        }),
      );
    }
  });
  if (t.allActions.filter((a) => a.action.type === "request_appointment").length > 1) {
    add({
      check: "duplicate-attempts",
      severity: "unsafe",
      detail: "more than one request_appointment was attempted",
    });
  }

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
