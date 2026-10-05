import { validateAppointmentTime } from "../../src/ai/business-hours";
import { isSlotAvailable } from "../../src/ai/availability";
import { extractStatedFields } from "../../src/ai/message-field-extraction";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { ScenarioRun, TurnRecord } from "./run-scenario";
import type { DeterministicScenario } from "../../tests/ai/fixtures/deterministic-scenarios";
import type { BusinessContext, ReceptionistActionType } from "../../src/ai/types";

/**
 * Grades a live ScenarioRun. Every check here READS production functions
 * (extractStatedFields, validateAppointmentTime, isSlotAvailable) as
 * independent auditing oracles — never re-implements or alters their
 * logic — so grading is exactly as trustworthy as the functions already
 * proven correct by the rest of the test suite, not a second opinion that
 * could itself be wrong.
 *
 * Category meanings (per the task's own definitions):
 *   A. llm            — the model misunderstood/hallucinated/stalled;
 *                        application state and safety rules were fine.
 *   B. application     — bookingState diverged from what the (model-
 *                        independent) extraction oracle says it should be.
 *   C. safety_intervention — the model proposed something unsafe and the
 *                        app correctly blocked it. NOT a failure — reported
 *                        as informational metadata alongside pass/fail.
 *   D. infrastructure  — an API call itself errored (network/auth/rate
 *                        limit/etc).
 * "safety_violation" is a fifth, deliberately-separate outcome: a safety
 * intervention that did NOT happen when it should have — i.e. an unsafe
 * completing action actually executed. This is the one category the task
 * calls out as a hard requirement to catch.
 */

export type FailureCategory = "llm" | "application" | "safety_violation" | "infrastructure";

export interface Classification {
  pass: boolean;
  category?: FailureCategory;
  notes: string[];
  /** Turns where the model proposed something unsafe and the app
   * correctly blocked it — informational, never a failure by itself. */
  safetyInterventions: string[];
}

const COMPLETING_ACTION_TYPES = new Set<ReceptionistActionType>([
  "request_appointment",
  "request_reschedule",
  "request_cancellation",
]);

const REJECTION_PATTERNS: { label: string; test: (reply: string) => boolean }[] = [
  { label: "hours rejection", test: (r) => /outside our hours|closed on/i.test(r) },
  { label: "availability rejection", test: (r) => /already booked/i.test(r) },
  { label: "phone rejection", test: (r) => /doesn't look complete/i.test(r) },
  { label: "decline safety net", test: (r) => /^No problem — I won't book that/.test(r) },
];

function detectInterventions(turns: TurnRecord[]): string[] {
  const found: string[] = [];
  turns.forEach((turn, i) => {
    for (const pattern of REJECTION_PATTERNS) {
      if (pattern.test(turn.reply)) {
        found.push(`turn ${i + 1} ("${turn.message}"): ${pattern.label} — "${turn.reply}"`);
      }
    }
  });
  return found;
}

/** Independent audit oracle: for every turn, re-derives what
 * extractStatedFields (the SAME function LLMProvider itself calls, read
 * here only for auditing) says the non-intent fields should be, and
 * compares against what actually landed in bookingState. Since this
 * extraction is 100% deterministic and provider-independent, any
 * mismatch can only be an application bug, never something the model
 * could have caused — the model is never even consulted for these
 * fields in production (see src/ai/message-field-extraction.ts). */
function auditStateFidelity(business: BusinessContext, turns: TurnRecord[]): string[] {
  const problems: string[] = [];
  const auditedFields = ["service", "date", "time", "name", "phone"] as const;

  for (const turn of turns) {
    const completingActionSucceeded = turn.actionsTaken.some(
      (a) => COMPLETING_ACTION_TYPES.has(a.action.type) && a.result.success,
    );
    // ReceptionistAgent itself (not LLMProvider/extraction) unconditionally
    // clears bookingState to {} whenever an escalate action succeeds this
    // turn (see receptionist-agent.ts: `bookingState: escalated ? {} : ...`)
    // — independent of whatever extraction would have produced. Auditing
    // extraction fidelity on a turn like that would always misfire.
    const escalatedSucceeded = turn.actionsTaken.some(
      (a) => a.action.type === "escalate" && a.result.success,
    );
    if (completingActionSucceeded || escalatedSucceeded) {
      // bookingState is expected to reset to {} regardless of extraction
      // once a completing action or a successful escalation fires this
      // turn — nothing to audit.
      continue;
    }

    const expectedIncrement = extractStatedFields(business, turn.message, turn.bookingStateBefore);
    const expected = { ...turn.bookingStateBefore, ...expectedIncrement };

    for (const field of auditedFields) {
      const actualValue = turn.bookingStateAfter[field];
      const expectedValue = expected[field];
      if (actualValue !== expectedValue) {
        problems.push(
          `turn ${turn.index + 1} ("${turn.message}"): bookingState.${field} = ${JSON.stringify(actualValue)}, ` +
            `but the extraction oracle (independent of any model) says it should be ${JSON.stringify(expectedValue)}`,
        );
      }
    }
  }
  return problems;
}

/** Any completing action that actually succeeded but independently fails
 * hours/availability re-validation would be a genuine safety-violation —
 * the one thing this whole architecture exists to prevent. In practice
 * this should NEVER fire, since ReceptionistTools' own backstop (src/
 * tools/receptionist-tools.ts) already re-checks before "success"; this
 * is a second, fully independent check from the harness side. */
function auditSafetyViolations(business: BusinessContext, turns: TurnRecord[]): string[] {
  const violations: string[] = [];
  for (const turn of turns) {
    for (const executed of turn.actionsTaken) {
      if (executed.action.type !== "request_appointment" || !executed.result.success) continue;
      const { service, preferredDate, preferredTime } = executed.action.payload;
      const svc = business.services.find((s) => s.name === service);
      const hours = validateAppointmentTime(business, preferredDate, preferredTime, svc?.durationMinutes ?? 0);
      if (!hours.valid) {
        violations.push(
          `turn ${turn.index + 1}: request_appointment SUCCEEDED for ${preferredDate} ${preferredTime}, ` +
            `but independent re-validation says this is outside business hours (${hours.reason})`,
        );
      } else if (!isSlotAvailable(business, preferredDate, preferredTime)) {
        violations.push(
          `turn ${turn.index + 1}: request_appointment SUCCEEDED for ${preferredDate} ${preferredTime}, ` +
            `but independent re-validation says this slot was already held`,
        );
      }
    }
  }
  return violations;
}

/** Scenario 3-specific: the customer's final message is an unambiguous
 * decline ("no") — no completing action may have executed on that turn,
 * regardless of what any provider proposed. Kept scenario-specific
 * (rather than reimplementing LLMProvider's NEGATIVE_RE here) since it's
 * the one scenario in the corpus built specifically to exercise this. */
function auditDeclineNeverBooks(turns: TurnRecord[]): string[] {
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || !/^\s*no\b/i.test(lastTurn.message)) return [];
  const booked = lastTurn.actionsTaken.some(
    (a) => COMPLETING_ACTION_TYPES.has(a.action.type) && a.result.success,
  );
  return booked
    ? [`turn ${lastTurn.index + 1}: customer said "${lastTurn.message}" and a completing action still succeeded`]
    : [];
}

function lastCompletingAction(turns: TurnRecord[]) {
  for (let i = turns.length - 1; i >= 0; i--) {
    const hit = turns[i].actionsTaken.find(
      (a) => COMPLETING_ACTION_TYPES.has(a.action.type) && a.result.success,
    );
    if (hit) return { turn: turns[i], executed: hit };
  }
  return undefined;
}

/** Per-scenario expected macro-outcome, tolerant of real conversational
 * variance (exact reply wording, exact turn where a field lands) — only
 * checks the things that actually matter: did the right thing end up
 * true by the end. Scenario ids match tests/ai/fixtures/deterministic-scenarios.ts. */
const OUTCOME_CHECKS: Record<number, (run: ScenarioRun) => string[]> = {
  1: (run) => {
    const notes: string[] = [];
    const completed = lastCompletingAction(run.turns);
    if (!completed) {
      notes.push("expected a successful request_appointment by the end — none occurred");
    } else if (completed.executed.action.type !== "request_appointment") {
      notes.push(`expected request_appointment, got ${completed.executed.action.type}`);
    } else {
      const p = completed.executed.action.payload;
      if (p.service !== "Routine cleaning") notes.push(`expected service "Routine cleaning", got "${p.service}"`);
      if (p.preferredDate !== "Tuesday") notes.push(`expected date "Tuesday", got "${p.preferredDate}"`);
      if (p.preferredTime !== "14:00") notes.push(`expected time "14:00", got "${p.preferredTime}"`);
      if (p.name !== "Trevor") notes.push(`expected name "Trevor", got "${p.name}"`);
      if (p.phone !== "+12428012847") notes.push(`expected phone "+12428012847", got "${p.phone}"`);
    }
    // Cleared state after completion now legitimately retains
    // bookingJustCompleted (deterministic proof a booking was just made,
    // used to block a hallucinated repeat action) rather than resetting
    // to a bare {} — see src/ai/types.ts's BookingState.bookingJustCompleted.
    const finalKeys = Object.keys(run.finalBookingState);
    if (finalKeys.length !== 1 || !run.finalBookingState.bookingJustCompleted) {
      notes.push(
        `expected bookingState cleared to just {bookingJustCompleted: true} after completion, got ${JSON.stringify(run.finalBookingState)}`,
      );
    }
    return notes;
  },
  2: (run) => {
    const notes: string[] = [];
    const last = run.finalBookingState;
    if (last.name !== "Sarah") notes.push(`expected name "Sarah", got "${last.name}"`);
    if (last.phone !== "+12428012847") notes.push(`expected phone "+12428012847", got "${last.phone}"`);
    if (last.service !== "Basic filling") notes.push(`expected service "Basic filling", got "${last.service}"`);
    if (last.date !== "Wednesday") notes.push(`expected date "Wednesday", got "${last.date}"`);
    if (last.time !== "11:00") notes.push(`expected time "11:00", got "${last.time}"`);
    if (last.pendingAction !== "confirm_service") notes.push("expected pendingAction to be confirm_service by the end");
    return notes;
  },
  3: (run) => {
    const notes = auditDeclineNeverBooks(run.turns);
    const last = run.finalBookingState;
    if (last.pendingAction) notes.push("expected pendingAction cleared after the decline");
    if (!last.service || !last.date || !last.name || !last.phone) {
      notes.push(`expected prior fields preserved after decline, got ${JSON.stringify(last)}`);
    }
    return notes;
  },
  4: (run) => {
    const notes: string[] = [];
    const last = run.finalBookingState;
    if (last.date !== "Wednesday") notes.push(`expected corrected date "Wednesday", got "${last.date}"`);
    if (last.time !== "14:00") notes.push(`expected preserved time "14:00", got "${last.time}"`);
    if (last.pendingAction !== "confirm_service") notes.push("expected pendingAction confirm_service after correction");
    return notes;
  },
  5: (run) => {
    const notes: string[] = [];
    const last = run.finalBookingState;
    if (last.time !== "15:00") notes.push(`expected corrected time "15:00", got "${last.time}"`);
    if (last.date !== "Tuesday") notes.push(`expected preserved date "Tuesday", got "${last.date}"`);
    if (last.pendingAction !== "confirm_service") notes.push("expected pendingAction confirm_service after correction");
    return notes;
  },
  6: (run) => {
    const notes: string[] = [];
    const last = run.finalBookingState;
    if (last.service !== "Basic filling") notes.push(`expected service "Basic filling", got "${last.service}"`);
    if (last.date !== "Tuesday") notes.push(`expected date "Tuesday", got "${last.date}"`);
    if (last.time !== "10:00") notes.push(`expected time "10:00", got "${last.time}"`);
    if (last.pendingAction !== "confirm_service") notes.push("expected pendingAction confirm_service by the end");
    return notes;
  },
  7: (run) => {
    const notes: string[] = [];
    const heldSlotBooked = run.turns.some((t) =>
      t.actionsTaken.some(
        (a) =>
          a.action.type === "request_appointment" &&
          a.result.success &&
          a.action.payload.preferredTime === "14:00",
      ),
    );
    if (heldSlotBooked) notes.push("the held 14:00 slot was booked successfully — availability check failed to block it");
    const completed = lastCompletingAction(run.turns);
    if (!completed) notes.push("expected the alternative slot (09:00, from '9am') to complete successfully — nothing completed");
    else if (completed.executed.action.type === "request_appointment" && completed.executed.action.payload.preferredTime !== "09:00") {
      notes.push(`expected the completed booking to use 09:00 (from "9am"), got "${completed.executed.action.payload.preferredTime}"`);
    }
    return notes;
  },
  8: (run) => {
    const notes: string[] = [];
    const outOfHoursBooked = run.turns.some((t) =>
      t.actionsTaken.some(
        (a) =>
          a.action.type === "request_appointment" &&
          a.result.success &&
          a.action.payload.preferredTime === "18:00",
      ),
    );
    if (outOfHoursBooked) notes.push("the out-of-hours 18:00 request succeeded — hours check failed to block it");
    const completed = lastCompletingAction(run.turns);
    if (!completed) notes.push("expected the valid retry (15:00, from 'Tuesday 3pm') to complete successfully — nothing completed");
    else if (completed.executed.action.type === "request_appointment" && completed.executed.action.payload.preferredTime !== "15:00") {
      notes.push(`expected the completed booking to use 15:00, got "${completed.executed.action.payload.preferredTime}"`);
    }
    return notes;
  },
  9: (run) => {
    const notes: string[] = [];
    const escalated = run.turns.some((t) =>
      t.actionsTaken.some((a) => a.action.type === "escalate" && a.result.success),
    );
    if (!escalated) notes.push("expected a successful escalate action — none occurred");
    if (!run.finalHandoffActive) notes.push("expected handoffActive === true by the end");
    return notes;
  },
  10: (run) => {
    const notes: string[] = [];
    const last = run.finalBookingState;
    // The known, already-documented app-level limitation (looksLikeName's
    // 3-word cap) means name capture from "its trevor, my numbers
    // 2428012847" is expected to fail regardless of which model is used —
    // extraction is model-independent. The correct, SAFE outcome here is
    // a stall (still asking for name), not a completion and not a
    // hallucinated "you're all set" — that's what's actually graded.
    if (last.phone !== "+12428012847") notes.push(`expected phone "+12428012847" captured, got "${last.phone}"`);
    const completed = lastCompletingAction(run.turns);
    if (completed) {
      notes.push(
        `a completing action succeeded despite name never being captured (payload: ${JSON.stringify(completed.executed.action.payload)}) — ` +
          "if the model supplied a name from memory/history rather than application state, this is worth a closer look",
      );
    }
    return notes;
  },
};

export function classifyRun(scenario: DeterministicScenario, run: ScenarioRun): Classification {
  const business = scenario.business ?? BAHAMAS_DENTAL_SERVICE;
  const safetyInterventions = detectInterventions(run.turns);

  const infraErrors = run.turns.filter((t) => t.apiError).map((t) => `turn ${t.index + 1}: ${t.apiError}`);
  if (infraErrors.length > 0) {
    return { pass: false, category: "infrastructure", notes: infraErrors, safetyInterventions };
  }

  const safetyViolations = [...auditSafetyViolations(business, run.turns), ...auditDeclineNeverBooks(run.turns)];
  if (safetyViolations.length > 0) {
    return { pass: false, category: "safety_violation", notes: safetyViolations, safetyInterventions };
  }

  const fidelityProblems = auditStateFidelity(business, run.turns);
  if (fidelityProblems.length > 0) {
    return { pass: false, category: "application", notes: fidelityProblems, safetyInterventions };
  }

  const outcomeCheck = OUTCOME_CHECKS[scenario.id];
  const outcomeProblems = outcomeCheck ? outcomeCheck(run) : [];
  if (outcomeProblems.length > 0) {
    return { pass: false, category: "llm", notes: outcomeProblems, safetyInterventions };
  }

  return { pass: true, notes: [], safetyInterventions };
}
