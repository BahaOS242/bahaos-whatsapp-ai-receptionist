import { isWithinOperatingWindow, validateAppointmentTime } from "../../src/ai/business-hours";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type {
  BookingIntent,
  BookingState,
  ExecutedAction,
  ReceptionistActionType,
} from "../../src/ai/types";
import type {
  DimensionResult,
  EvalScenario,
  EvalTranscript,
  ResolutionOutcome,
  ScenarioEvaluation,
} from "./types";

/**
 * Deterministic Evaluator — Phase 1. Every check here is a structural
 * assertion against BookingState / ExecutedAction data (or, for FLOW, a
 * fixed regex against the small closed set of reply templates
 * dev-rule-based-provider.ts actually uses) — never an LLM judgment call.
 * Given the same transcript, every run of this module produces the exact
 * same result, which is the whole point of Phase 1: reproducible
 * measurement before any LLM-based judgment is introduced later.
 */

const COMPLETING_ACTION_TO_INTENT: Partial<Record<ReceptionistActionType, BookingIntent>> = {
  request_appointment: "book_appointment",
  request_reschedule: "reschedule_appointment",
  request_cancellation: "cancel_appointment",
};

function successfulCompletingAction(transcript: EvalTranscript): ExecutedAction | undefined {
  return transcript.allActions.find(
    (a) => a.result.success && a.action.type in COMPLETING_ACTION_TO_INTENT,
  );
}

function successfulEscalation(transcript: EvalTranscript): boolean {
  return transcript.allActions.some((a) => a.action.type === "escalate" && a.result.success);
}

/** What intent did this conversation actually pursue/achieve — derived
 * purely from structured data (a completing action's type takes
 * priority; otherwise the last non-empty bookingState.intent seen across
 * turns), never from reply text. */
export function deriveAchievedIntent(transcript: EvalTranscript): BookingIntent | undefined {
  const completing = successfulCompletingAction(transcript);
  if (completing) return COMPLETING_ACTION_TO_INTENT[completing.action.type];

  for (let i = transcript.turns.length - 1; i >= 0; i--) {
    const intent = transcript.turns[i].bookingState.intent;
    if (intent) return intent;
  }
  return undefined;
}

/** Deterministic classification of how the conversation actually ended.
 * - escalated: handoff is active at the end, or an escalate action ever
 *   succeeded.
 * - completed: a booking/reschedule/cancellation action succeeded.
 * - abandoned: an intent was engaged at some point but the conversation
 *   ended with no intent, no completion, and no escalation (e.g. "never
 *   mind").
 * - unresolved: still mid-flow (an intent is still set), or nothing was
 *   ever engaged at all (e.g. a standalone FAQ exchange). */
export function deriveActualOutcome(transcript: EvalTranscript): ResolutionOutcome {
  if (transcript.finalHandoffActive || successfulEscalation(transcript)) return "escalated";
  if (successfulCompletingAction(transcript)) return "completed";

  const everEngagedIntent = transcript.turns.some((t) => t.bookingState.intent);
  if (everEngagedIntent && !transcript.finalState.intent) return "abandoned";
  return "unresolved";
}

/** "invalid" is a scenario EXPECTATION, not something deriveActualOutcome
 * ever produces directly — it means "an invalid request should be
 * correctly rejected, leaving the conversation mid-flow" which
 * deriveActualOutcome reports as "unresolved". This is a documented
 * equivalence, not a loophole: for these scenarios the real pass/fail
 * signal is the BUSINESS_RULES dimension (no invalid booking occurred),
 * not this label match. */
function outcomesCompatible(expected: ResolutionOutcome, actual: ResolutionOutcome): boolean {
  if (expected === actual) return true;
  if (expected === "invalid" && actual === "unresolved") return true;
  return false;
}

function evaluateIntent(scenario: EvalScenario, transcript: EvalTranscript): DimensionResult {
  if (!scenario.expected.intent) {
    return { dimension: "intent", applicable: false, passed: true, details: [] };
  }
  const achieved = deriveAchievedIntent(transcript);
  const passed = achieved === scenario.expected.intent;
  return {
    dimension: "intent",
    applicable: true,
    passed,
    details: passed
      ? []
      : [`expected intent "${scenario.expected.intent}", achieved "${achieved ?? "none"}"`],
  };
}

function evaluateState(scenario: EvalScenario, transcript: EvalTranscript): DimensionResult {
  if (!scenario.expected.finalState) {
    return { dimension: "state", applicable: false, passed: true, details: [] };
  }
  const details: string[] = [];
  for (const [key, expectedValue] of Object.entries(scenario.expected.finalState)) {
    const actualValue = (transcript.finalState as Record<string, unknown>)[key];
    if (actualValue !== expectedValue) {
      details.push(
        `finalState.${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`,
      );
    }
  }
  return { dimension: "state", applicable: true, passed: details.length === 0, details };
}

/** Independently re-validates every successful booking/reschedule action
 * against business-hours.ts — the SAME real validation module the
 * production code uses, called here a third time (provider, tool, and
 * now evaluator) so a hypothetical bug that broke both the provider's
 * and the tool's checks in the same way would still be caught. */
function evaluateBusinessRules(
  _scenario: EvalScenario,
  transcript: EvalTranscript,
): DimensionResult {
  const details: string[] = [];

  for (const executed of transcript.allActions) {
    if (executed.action.type === "request_appointment" && executed.result.success) {
      const { service, preferredDate, preferredTime } = executed.action.payload;
      const svc = BAHAMAS_DENTAL_SERVICE.services.find((s) => s.name === service);
      const validation = validateAppointmentTime(
        BAHAMAS_DENTAL_SERVICE,
        preferredDate,
        preferredTime,
        svc?.durationMinutes ?? 0,
      );
      if (!validation.valid) {
        details.push(
          `request_appointment succeeded for an out-of-hours time: ${preferredDate} ${preferredTime} (${validation.reason})`,
        );
      }
    }
    if (executed.action.type === "request_reschedule" && executed.result.success) {
      const { newPreferredDate, newPreferredTime } = executed.action.payload;
      const validation = isWithinOperatingWindow(
        BAHAMAS_DENTAL_SERVICE,
        newPreferredDate,
        newPreferredTime,
      );
      if (!validation.valid) {
        details.push(
          `request_reschedule succeeded for an out-of-hours time: ${newPreferredDate} ${newPreferredTime} (${validation.reason})`,
        );
      }
    }
  }

  return { dimension: "business_rules", applicable: true, passed: details.length === 0, details };
}

function payloadMatches(actual: unknown, expected: Record<string, unknown>): boolean {
  if (typeof actual !== "object" || actual === null) return false;
  const record = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => record[key] === value);
}

function evaluateToolSafety(scenario: EvalScenario, transcript: EvalTranscript): DimensionResult {
  const details: string[] = [];

  if (scenario.expected.actions) {
    let cursor = 0;
    for (const expectedAction of scenario.expected.actions) {
      const foundIndex = transcript.allActions.findIndex((executed, idx) => {
        if (idx < cursor) return false;
        if (executed.action.type !== expectedAction.type) return false;
        if (
          expectedAction.payload &&
          !payloadMatches(executed.action.payload, expectedAction.payload)
        )
          return false;
        const expectedSuccess = expectedAction.success ?? true;
        return executed.result.success === expectedSuccess;
      });
      if (foundIndex === -1) {
        details.push(
          `expected action "${expectedAction.type}" (success=${expectedAction.success ?? true}${
            expectedAction.payload ? `, payload⊇${JSON.stringify(expectedAction.payload)}` : ""
          }) not found in order`,
        );
      } else {
        cursor = foundIndex + 1;
      }
    }
  }

  if (scenario.expected.prohibitedActions) {
    for (const prohibited of scenario.expected.prohibitedActions) {
      if (transcript.allActions.some((a) => a.action.type === prohibited)) {
        details.push(`prohibited action "${prohibited}" was executed`);
      }
    }
  }

  // General invariant, regardless of scenario: never more than one
  // successful completing action in a single conversation.
  const completingCount = transcript.allActions.filter(
    (a) => a.result.success && a.action.type in COMPLETING_ACTION_TO_INTENT,
  ).length;
  if (completingCount > 1) {
    details.push(
      `${completingCount} successful completing actions occurred in one conversation (duplicate-booking risk)`,
    );
  }

  return { dimension: "tool_safety", applicable: true, passed: details.length === 0, details };
}

/** Reply-text patterns matching this app's small, fixed set of
 * askForField prompts — not a general NLU check, just the exact strings
 * dev-rule-based-provider.ts is known to produce. */
const FIELD_ASK_PATTERNS: Partial<Record<keyof BookingState, RegExp>> = {
  name: /\byour name\b/i,
  phone: /\bphone number\b/i,
  date: /\bwhat day\b/i,
  time: /\bwhat time\b|\band time\b/i,
  service: /\bwhich service\b/i,
};

function evaluateFlow(_scenario: EvalScenario, transcript: EvalTranscript): DimensionResult {
  const details: string[] = [];

  for (let i = 0; i < transcript.turns.length; i++) {
    const turn = transcript.turns[i];

    // Never re-ask for a field bookingState already has.
    for (const [field, pattern] of Object.entries(FIELD_ASK_PATTERNS) as [
      keyof BookingState,
      RegExp,
    ][]) {
      if (turn.bookingState[field] && pattern.test(turn.reply)) {
        details.push(
          `turn ${i + 1}: reply re-asks for "${field}" even though bookingState.${field} is already "${String(turn.bookingState[field])}"`,
        );
      }
    }

    // Business hours validated BEFORE name/phone are ever asked: whenever
    // a reply asks for name/phone, any date+time already in state must
    // independently be hours-valid.
    const asksForIdentity = /\byour name\b|\bphone number\b/i.test(turn.reply);
    if (asksForIdentity && turn.bookingState.date && turn.bookingState.time) {
      const flow = turn.bookingState.intent;
      const svc = BAHAMAS_DENTAL_SERVICE.services.find((s) => s.name === turn.bookingState.service);
      const validation =
        flow === "book_appointment"
          ? validateAppointmentTime(
              BAHAMAS_DENTAL_SERVICE,
              turn.bookingState.date,
              turn.bookingState.time,
              svc?.durationMinutes ?? 0,
            )
          : isWithinOperatingWindow(
              BAHAMAS_DENTAL_SERVICE,
              turn.bookingState.date,
              turn.bookingState.time,
            );
      if (!validation.valid) {
        details.push(
          `turn ${i + 1}: asked for name/phone while holding an invalid date/time (${turn.bookingState.date} ${turn.bookingState.time})`,
        );
      }
    }
  }

  return { dimension: "flow", applicable: true, passed: details.length === 0, details };
}

/** Monotonic-progress check: once service/name/phone is captured, it must
 * never silently become unset again while the SAME intent is still being
 * pursued — the only legitimate ways a field disappears are (a) date/time
 * being cleared together after a business-hours rejection (not checked
 * here, that's business_rules'/flow's territory), or (b) the whole
 * conversation resetting (intent itself becoming unset — abandonment or
 * completion). A field silently reverting to undefined while intent is
 * STILL set is a real information-loss bug, not a stuck loop — an
 * earlier version of this check flagged "the same reply repeated" as
 * "stuck," which produced false positives on completely normal
 * still-unanswered re-asks, so it was replaced with this. */
function evaluateRecovery(_scenario: EvalScenario, transcript: EvalTranscript): DimensionResult {
  const details: string[] = [];
  const monitored = ["service", "name", "phone"] as const;

  for (let i = 1; i < transcript.turns.length; i++) {
    const prev = transcript.turns[i - 1].bookingState;
    const curr = transcript.turns[i].bookingState;
    if (!curr.intent) continue; // full reset (abandon/complete) — not a loss.

    for (const field of monitored) {
      if (prev[field] && !curr[field]) {
        details.push(
          `turn ${i + 1}: bookingState.${field} was "${prev[field]}" and is now missing, without the flow resetting`,
        );
      }
    }
  }

  return {
    dimension: "recovery",
    applicable: transcript.turns.length > 1,
    passed: details.length === 0,
    details,
  };
}

function evaluateEscalation(scenario: EvalScenario, transcript: EvalTranscript): DimensionResult {
  const details: string[] = [];
  const escalationIndex = transcript.turns.findIndex((t) =>
    t.actionsTaken.some((a) => a.action.type === "escalate" && a.result.success),
  );

  if (scenario.expected.outcome === "escalated" && escalationIndex === -1) {
    details.push("expected escalation, but no successful escalate action occurred");
  }

  if (escalationIndex !== -1) {
    for (let i = escalationIndex + 1; i < transcript.turns.length; i++) {
      if (transcript.turns[i].actionsTaken.length > 0) {
        details.push(
          `turn ${i + 1}: an automated action executed AFTER escalation — handoff was not enforced`,
        );
      }
    }
  }

  return {
    dimension: "escalation",
    applicable: scenario.expected.outcome === "escalated" || escalationIndex !== -1,
    passed: details.length === 0,
    details,
  };
}

function evaluateResolution(scenario: EvalScenario, transcript: EvalTranscript): DimensionResult {
  const actual = deriveActualOutcome(transcript);
  const passed = outcomesCompatible(scenario.expected.outcome, actual);
  return {
    dimension: "resolution",
    applicable: true,
    passed,
    details: passed ? [] : [`expected outcome "${scenario.expected.outcome}", actual "${actual}"`],
  };
}

export function evaluateScenario(
  scenario: EvalScenario,
  transcript: EvalTranscript,
): ScenarioEvaluation {
  const dimensions: DimensionResult[] = [
    evaluateIntent(scenario, transcript),
    evaluateState(scenario, transcript),
    evaluateBusinessRules(scenario, transcript),
    evaluateToolSafety(scenario, transcript),
    evaluateFlow(scenario, transcript),
    evaluateRecovery(scenario, transcript),
    evaluateEscalation(scenario, transcript),
    evaluateResolution(scenario, transcript),
  ];
  const overallPassed = dimensions.every((d) => !d.applicable || d.passed);

  return {
    scenario,
    transcript,
    dimensions,
    actualOutcome: deriveActualOutcome(transcript),
    overallPassed,
  };
}
