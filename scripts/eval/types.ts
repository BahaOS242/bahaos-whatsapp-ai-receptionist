import type {
  BookingIntent,
  BookingState,
  ExecutedAction,
  ReceptionistActionType,
} from "../../src/ai/types";

/**
 * Conversation Evaluation Engine — Phase 1 types.
 *
 * Architecture:
 *   Conversation Scenarios -> Conversation Runner -> ReceptionistAgent
 *   -> transcript (turns + structured state + actions) -> Evaluator
 *   -> Scorecard -> failure classification -> report
 *
 * This is a measurement system, not a test suite that pins current
 * behavior: every scenario's `expected` block records what a CORRECTLY
 * functioning receptionist should do, so a scenario failing is a
 * legitimate finding about the receptionist, not a bug in the harness.
 * Nothing here imports from or modifies src/ai or src/tools — it only
 * consumes their existing public exports, exactly like
 * tests/torture/helpers.ts and scripts/dev-chat.ts already do.
 */

export type EvalCategory =
  | "booking"
  | "faq"
  | "cancellation"
  | "rescheduling"
  | "escalation"
  | "recovery"
  | "natural_language";

/** Final classification of how a conversation ended — see
 * evaluator.ts's deriveActualOutcome for the deterministic derivation
 * rules, and outcomesCompatible for how "invalid" is reconciled against
 * the derived set. */
export type ResolutionOutcome = "completed" | "abandoned" | "escalated" | "unresolved" | "invalid";

/** One action a scenario expects to see in the transcript, in order
 * relative to any other expected actions (checked as a subsequence, not
 * necessarily adjacent — other actions, e.g. an earlier failed attempt,
 * may appear in between). `payload`, if given, is checked as a partial
 * match (every provided key must equal the actual value) — not required
 * to list every payload field. */
export interface ExpectedAction {
  type: ReceptionistActionType;
  payload?: Record<string, unknown>;
  /** Defaults to true — set false to expect a DELIBERATELY failed action
   * (e.g. proving the tool-level backstop rejects an out-of-hours
   * payload even if a provider somehow proposed one). */
  success?: boolean;
}

export interface EvalScenarioExpectation {
  outcome: ResolutionOutcome;
  /** The BookingIntent the conversation should have pursued/achieved by
   * the end — derived from a completing action's type when one exists,
   * otherwise the last non-empty bookingState.intent seen. Omit for
   * scenarios with no booking-related intent at all (e.g. a standalone
   * FAQ or pure garbage-input scenario). */
  intent?: BookingIntent;
  /** Expected BookingState fields as of the LAST turn. For a scenario
   * that expects to complete, this is almost always `{}` (state clears
   * on completion) — the meaningful check for a completed scenario is
   * `actions`, not `finalState`. For a scenario that expects to remain
   * mid-flow, this records exactly what should have been captured (and,
   * implicitly, what should NOT — any key absent from this object is not
   * checked, so only list what matters for that scenario). */
  finalState?: Partial<BookingState>;
  /** Actions that MUST appear, in order, somewhere in the transcript. */
  actions?: ExpectedAction[];
  /** Action TYPES that must NEVER appear anywhere in the transcript. */
  prohibitedActions?: ReceptionistActionType[];
}

export interface EvalScenario {
  id: string;
  category: EvalCategory;
  description: string;
  /** Customer messages, applied in order as separate turns. */
  turns: string[];
  expected: EvalScenarioExpectation;
  notes?: string;
}

export interface EvalTurnRecord {
  input: string;
  reply: string;
  bookingState: BookingState;
  safetyOverride: boolean;
  handoffActive: boolean;
  actionsTaken: ExecutedAction[];
}

export interface EvalTranscript {
  scenarioId: string;
  turns: EvalTurnRecord[];
  /** bookingState after the final turn (or `{}` if the scenario had no
   * turns at all). */
  finalState: BookingState;
  /** Every action taken across every turn, flattened in order. */
  allActions: ExecutedAction[];
  /** handoffActive after the final turn. */
  finalHandoffActive: boolean;
}

export type EvalDimension =
  | "intent"
  | "state"
  | "business_rules"
  | "tool_safety"
  | "flow"
  | "recovery"
  | "escalation"
  | "resolution";

export interface DimensionResult {
  dimension: EvalDimension;
  /** False when this dimension has nothing to check for this particular
   * scenario (e.g. INTENT when the scenario declares no expected
   * intent) — an inapplicable dimension never counts against
   * overallPassed and is excluded from the dimension's pass-rate in the
   * scorecard. */
  applicable: boolean;
  passed: boolean;
  /** Human-readable specifics for every check that failed — empty when
   * passed. */
  details: string[];
}

export interface ScenarioEvaluation {
  scenario: EvalScenario;
  transcript: EvalTranscript;
  dimensions: DimensionResult[];
  actualOutcome: ResolutionOutcome;
  /** True iff every APPLICABLE dimension passed. */
  overallPassed: boolean;
}

export interface FailureRecord {
  scenarioId: string;
  category: EvalCategory;
  description: string;
  failedDimensions: { dimension: EvalDimension; details: string[] }[];
}

export interface Scorecard {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  byCategory: Partial<Record<EvalCategory, { total: number; passed: number }>>;
  byDimension: Partial<Record<EvalDimension, { applicable: number; passed: number }>>;
  failures: FailureRecord[];
}
