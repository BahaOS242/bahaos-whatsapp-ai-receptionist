import type { ExpectedAction, ResolutionOutcome } from "../eval/types";
import type { BookingState, ReceptionistActionType } from "../../src/ai/types";

/**
 * Taskmaster-derived conversation test types.
 *
 * Source dialogs (Google Taskmaster-1, CC BY 4.0) are crowd-authored
 * role-plays about auto repair and restaurant booking. They are used ONLY
 * as a source of conversational mechanisms (corrections, out-of-order
 * details, interruptions, unanswerable questions). Every scenario here is
 * an original BahaOS clinic adaptation with synthetic identities; no
 * source prices, dates, phone numbers, policies or assistant replies are
 * imported.
 */
export type VariantKind = "adaptation" | "typo" | "bahamian";

export interface ReplyCheck {
  /** 0-based index of the customer turn whose reply is checked. */
  turn: number;
  /** Regex source strings; reply must match ALL (case-insensitive). */
  mustMatch?: string[];
  /** Regex source strings; reply must match NONE (case-insensitive). */
  mustNotMatch?: string[];
  why: string;
}

export interface Correction {
  /** Customer turn index at which listed state fields may legitimately change/clear. */
  turn: number;
  fields: (keyof BookingState)[];
}

export interface ScenarioExpect {
  outcome: ResolutionOutcome;
  /** Exact number of successful completing booking actions (request_appointment). */
  bookings: 0 | 1;
  actions?: ExpectedAction[];
  prohibitedActions?: ReceptionistActionType[];
  finalState?: Partial<BookingState>;
  replyChecks?: ReplyCheck[];
  corrections?: Correction[];
}

export interface ConvScenario {
  /** e.g. TM-65958f69 (adaptation), TM-65958f69-T (typo), TM-65958f69-B (bahamian). */
  id: string;
  /** Source conversation grouping key; all derived variants share it. */
  sourceId: string;
  sourceDomain: string;
  variant: VariantKind;
  /** Which conversational mechanism of the source was adapted. */
  mechanism: string;
  /** What was changed relative to the source (facts, services, flow). */
  changes: string[];
  /** Deterministic seed recorded for reproducibility. */
  seed: number;
  turns: string[];
  expect: ScenarioExpect;
  /** For typo / bahamian variants: the adaptation they derive from. */
  derivedFrom?: string;
  /** Authored augmentation label (never source dialect). */
  augmentation?: string;
  /** Typo edits applied: [from, to] pairs. */
  typoEdits?: [string, string][];
}
