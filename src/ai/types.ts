/**
 * Shared types for the AI receptionist layer.
 *
 * Architecture (Phase 4 of IMPLEMENTATION_PLAN.md):
 *   ReceptionistAgent -> AIProvider -> { DevRuleBasedAIProvider | LLMProvider }
 *                      -> ReceptionistTools (the only thing that "acts")
 *
 * The AIProvider never touches src/db directly, in either implementation.
 * It only ever proposes ReceptionistAction objects; ReceptionistAgent is
 * responsible for executing them via ReceptionistTools and for deciding
 * what the customer actually hears based on whether that execution
 * succeeded — see receptionist-agent.ts for why that split matters.
 */

import type { KnowledgeGap, KnowledgeLookup } from "../knowledge/types";

export interface BusinessService {
  id: string;
  name: string;
  durationMinutes: number;
  priceLabel: string;
}

export interface BusinessPolicies {
  insurance: string;
  newPatientInfo: string;
  cancellationCutoffHours: number;
  emergencyPolicy: string;
}

export type Weekday =
  "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";

export interface DayHours {
  /** 24-hour "HH:MM", e.g. "09:00". */
  open: string;
  /** 24-hour "HH:MM", e.g. "17:00". */
  close: string;
}

export interface BusinessContext {
  name: string;
  timezone: string;
  address: string;
  /** Human-readable display string, e.g. for FAQ answers and rejection
   * messages — kept alongside `weeklyHours` rather than derived from it,
   * since the exact wording ("(local time)", etc.) is a copy decision. */
  hours: string;
  /** Structured, machine-checkable hours per weekday — `null` means
   * closed that day. This, not `hours`, is what appointment-time
   * validation (src/ai/business-hours.ts) actually reads. */
  weeklyHours: Record<Weekday, DayHours | null>;
  services: BusinessService[];
  policies: BusinessPolicies;
  /** Sent to the customer when a request is escalated to staff. */
  escalationHandoffMessage: string;
  /** Local phone area code, used to normalize a bare local number (e.g.
   * "8012847") given without one — see src/ai/phone.ts. */
  areaCode: string;
  /** Specific date+time slots already held by an existing appointment —
   * checked immediately after business-hours validation (src/ai/availability.ts),
   * before name/phone are ever asked. A slot can be within business hours
   * and still unavailable. Omitted/empty means every in-hours time is
   * available, so existing tenants/tests are unaffected. */
  unavailableSlots?: { date: string; time: string }[];
}

export interface CustomerContext {
  id?: string;
  name?: string;
  phone?: string;
}

export type ConversationRole = "customer" | "assistant";

export interface ConversationTurn {
  role: ConversationRole;
  content: string;
}

export type BookingIntent =
  | "book_appointment"
  | "reschedule_appointment"
  | "cancel_appointment"
  | "book_recurring_appointment";

/**
 * A structured record of what the customer is currently being asked to
 * confirm — the fix for a "yes"/"no" reply being unrecognized. Set
 * whenever a turn poses a yes/no question whose answer determines what
 * happens next (e.g. "Would you like to book it?"), and cleared once
 * answered. A provider decides what "yes" means by checking THIS field,
 * never by re-matching its own previous reply text or re-scanning
 * conversation history — that's what makes the answer reliable regardless
 * of exact wording ("yes" / "yeah" / "yes please"). New confirmation
 * kinds (e.g. a reschedule or cancellation confirmation) extend this
 * union rather than introducing a separate mechanism.
 *
 * Two values exist because they mean genuinely different things:
 *   - "confirm_service": LLMProvider's ONLY confirmation step — set once
 *     every field required for the CURRENT intent (booking, reschedule,
 *     or cancellation) is known, i.e. the final "here's everything,
 *     shall I go ahead?" gate. DevRuleBasedAIProvider also uses this
 *     value, but for a DIFFERENT, EARLIER purpose: "would you like to
 *     book this service?", asked as soon as a service is named, before
 *     date/time/name/phone are even collected.
 *   - "confirm_booking": DevRuleBasedAIProvider's final gate, the exact
 *     analog of LLMProvider's "confirm_service" — set once every
 *     required field is known, distinct from its own earlier
 *     "confirm_service" step so the two can never be confused with each
 *     other. See src/ai/booking-confirmation.ts's
 *     isConfirmedCompletingAction, which treats both as "a real final
 *     confirmation is pending" for the hard gate every completing action
 *     must pass.
 */
export type PendingAction = "confirm_service" | "confirm_booking";

/**
 * Structured, persisted state for an in-progress booking/reschedule/
 * cancellation — the actual fix for the "asks for the same info twice"
 * class of bug. This is extracted ONCE per turn from the new message and
 * merged into whatever was already known; it is never re-derived by
 * re-scanning the full conversation transcript. ConversationManager owns
 * storage; AIProvider implementations read/return it, never invent their
 * own separate notion of "what do we already know."
 */
export interface BookingState {
  intent?: BookingIntent;
  service?: string;
  /** Canonical weekday name (e.g. "Tuesday") or "Today"/relative-resolved
   * equivalent — not a full calendar date, matching what the business
   * actually needs to hand to staff. */
  date?: string;
  /** 24-hour "HH:MM", e.g. "18:00". Never guessed from an ambiguous bare
   * number — see src/ai/date-time.ts. */
  time?: string;
  name?: string;
  /** Normalized E.164-ish form, e.g. "+12428012847" — see src/ai/phone.ts. */
  phone?: string;
  /** See PendingAction. Absent when nothing is currently awaiting a
   * yes/no answer. */
  pendingAction?: PendingAction;
  /** An hour stated without am/pm (e.g. "9" in "tomorrow at 9"), encoded
   * as "H:MM", remembered so a later bare "am"/"pm" reply can complete it
   * — see date-time.ts parseBareHour/parseBareMeridiem/combineBareTime.
   * Cleared the moment `time` is resolved through any path. */
  pendingBareTime?: string;
  /** Set when the customer qualified a time instead of stating one ("quarter to 3pm", "not 3pm", "3pm or 4pm",
   * "from 2pm to 4pm" — see date-time.ts hasTimeQualifier). Any stored `time` is kept but treated as UNRESOLVED:
   * `time` counts as missing (nothing can be confirmed or booked) until the customer states one exact time, which
   * replaces it and clears this flag; a fresh confirmation is then required. */
  timeClarification?: boolean;
  /** A specific, deterministically-computed corrected time ("HH:MM") the
   * application has proposed in response to an invalid stated time (e.g.
   * customer said "2am", app proposes "14:00" and asks "Did you mean 2 PM
   * instead?") — see llm-provider.ts's hours-validation-before-
   * confirmation block for how it's proposed, and
   * message-field-extraction.ts's early pendingCorrection branch for how
   * an explicit yes/no answers it. An unambiguous "yes" applies THIS
   * value to `time` (never a generic booking confirmation — see
   * BookingState-level docs on the hard confirmation gate); an
   * unambiguous "no" discards both the correction and the invalid `time`
   * it was proposed for. Genuine bug fixed by this field: previously the
   * "did you mean X instead" phrasing existed only in the model's own
   * prose, backed by no application state at all, so a customer's "yes"
   * had nothing deterministic to confirm and fell through to the model
   * to guess. Cleared the moment it's answered, one way or the other. */
  pendingCorrection?: string;
  /** Months between occurrences (3, 6, or 12) — only meaningful when
   * `intent` is "book_recurring_appointment"; see src/ai/recurrence.ts
   * for detection ("every 6 months", "every year", ...) and occurrence
   * generation. Explicitly represented as its own field rather than
   * folded into `date`/`time` — Section 5's own requirement: "Represent
   * recurrence explicitly rather than treating it as a FAQ." */
  recurrenceIntervalMonths?: number;
  /** Set (instead of a full reset to `{}`) the moment a completing action
   * (request_appointment/request_reschedule/request_cancellation) actually
   * succeeds — deterministic proof a booking was just made, independent of
   * anything the model says. Exists specifically so a later turn can
   * recognize "we just finished one of these" and block a hallucinated
   * repeat action, without depending on the model remembering it did this
   * already. Cleared the moment a NEW intent is established afterward
   * (deterministically or model-reported) — see llm-provider.ts's
   * deriveBookingState. */
  bookingJustCompleted?: boolean;
  /** Snapshot of exactly what was just booked, captured alongside
   * bookingJustCompleted (from the succeeding action's own payload — the
   * actual submitted values, not whatever bookingState happened to hold)
   * so a correction arriving on the very next turn ("actually, Wednesday
   * instead") has enough information — name/phone in particular — to be
   * converted into a real request_reschedule, instead of having nowhere
   * to land. Cleared together with bookingJustCompleted. See
   * message-field-extraction.ts's detectPostCompletionReschedule. */
  lastCompletedBooking?: CompletedBookingSnapshot;
  /** Objective 4 — "the receptionist must be comfortable admitting
   * uncertainty." Counts CONSECUTIVE turns where nothing was understood
   * at all: no active booking intent, no field extracted, no
   * recognized FAQ/greeting/escalation trigger. Reset to 0/absent the
   * moment ANY of those happens. After a small threshold (see
   * UNCLEAR_TURN_ESCALATION_THRESHOLD in llm-provider.ts/
   * dev-rule-based-provider.ts), the application proactively escalates
   * rather than repeating the same generic clarification question
   * forever — genuinely not understanding someone twice in a row is a
   * real signal, not something to loop on indefinitely. This is a
   * COUNT of confusion, never authorization for anything else — it can
   * only ever lead to escalation, never to booking. */
  unclearTurnCount?: number;
  /** Set for exactly ONE turn — the turn immediately following an
   * explicit decline of a presented confirmation ("no") — and always
   * cleared (consumed) by that next turn's own field extraction,
   * regardless of what it finds. Fixes a genuine bug: a decline strips
   * `pendingAction` but deliberately preserves every OTHER field (so the
   * customer isn't forced to restate a whole booking to change one
   * thing) — but the very next turn's deterministic extraction normally
   * only overwrites an ALREADY-set field when the message contains an
   * explicit correction marker ("actually"/"instead"/...). A bare
   * restatement right after a decline ("no" -> "a cleaning", with no
   * marker) was therefore silently ignored: the field stayed at its
   * STALE, just-declined value, `pendingAction` got silently re-armed
   * back to "confirm_service" on the SAME stale value the next time
   * fields were (still) all present, and a later "yes" — answering
   * whatever the model asked about the correction, not the stale
   * pending question — auto-confirmed the WRONG, stale details. This
   * flag gives the customer's very next word, right after a decline,
   * the same license an explicit correction marker already has: it's
   * overwhelmingly likely to be the correction being declined *for*,
   * so it's treated as one even without "actually"/"instead". See
   * message-field-extraction.ts's `hasCorrection` and
   * dev-rule-based-provider.ts's identical, separately-applied fix. */
  justDeclined?: boolean;
}

export interface CompletedBookingSnapshot {
  intent: BookingIntent;
  service?: string;
  date?: string;
  time?: string;
  name?: string;
  phone?: string;
}

export type ReceptionistActionType =
  | "create_lead"
  | "request_appointment"
  | "request_reschedule"
  | "request_cancellation"
  | "request_recurring_appointment"
  | "escalate";

export interface CreateLeadPayload {
  name: string;
  phone?: string;
  serviceInterest?: string;
  /** Set by ReceptionistAgent at execution time (never proposed by a
   * provider/model) when the caller supplied one via
   * AIProviderRequest.conversationId — lets a DB-backed
   * ReceptionistTools implementation persist a real, traceable lead row.
   * Undefined for any caller not using durable persistence (e.g. the
   * in-memory ConversationManager); those tools implementations still
   * just log, unaffected. */
  conversationId?: string;
}

export interface RequestAppointmentPayload {
  name: string;
  phone: string;
  service: string;
  preferredDate: string;
  preferredTime: string;
}

/** Section 5/6/8: the deterministic layer's own list of already-validated
 * occurrence dates — NEVER the model's enumeration. `occurrenceDates`
 * includes `startDate` itself as its first element. Every date here has
 * already been checked via AIProviderRequest.checkAvailability before
 * this payload was ever constructed (see buildRecurringConfirmTool in
 * both providers) — a ReceptionistTools implementation is still expected
 * to re-validate defensively (same "no AIProvider decision is trusted"
 * principle as every other action), but should not expect to find a
 * conflict here in practice. */
export interface RequestRecurringAppointmentPayload {
  name: string;
  phone: string;
  service: string;
  startDate: string;
  startTime: string;
  recurrenceIntervalMonths: number;
  occurrenceDates: string[];
}

export interface RequestReschedulePayload {
  name: string;
  phone: string;
  newPreferredDate: string;
  newPreferredTime: string;
}

export interface RequestCancellationPayload {
  name: string;
  phone: string;
  reason?: string;
}

export interface EscalatePayload {
  reason: string;
  /** Set by ReceptionistAgent at execution time — see
   * CreateLeadPayload.conversationId's docstring for why this is never
   * something a provider/model proposes itself. */
  conversationId?: string;
  /** The BookingState as of the turn that triggered this escalation —
   * Objective 7's "current booking state" requirement for what a human
   * needs to act on a handoff. Also set by ReceptionistAgent, from
   * whatever's most accurate at the point of escalation (the provider's
   * own response when one exists, otherwise the incoming request
   * state). */
  bookingStateSnapshot?: BookingState;
  /** Objective 4/7: the customer's own message that the application
   * genuinely could not understand, when that's specifically why this
   * escalation fired (see LLMProvider's unclearTurnCount handling).
   * Absent for every other escalation reason (explicit request,
   * emergency, a failed action) — never fabricated. */
  unresolvedQuestion?: string;
}

export type ReceptionistAction =
  | { type: "create_lead"; payload: CreateLeadPayload }
  | { type: "request_appointment"; payload: RequestAppointmentPayload }
  | { type: "request_reschedule"; payload: RequestReschedulePayload }
  | { type: "request_cancellation"; payload: RequestCancellationPayload }
  | { type: "request_recurring_appointment"; payload: RequestRecurringAppointmentPayload }
  | { type: "escalate"; payload: EscalatePayload };

/** What an AIProvider hands back for one turn: a reply to (tentatively)
 * send, plus zero or more actions it wants executed, plus the booking
 * state as it stands after this turn (unchanged from the request if this
 * turn didn't touch it — e.g. a plain FAQ question). The reply is only
 * ever sent to the customer as-is if every action succeeds — see
 * ReceptionistAgent. */
export interface AIProviderResponse {
  reply: string;
  actions: ReceptionistAction[];
  bookingState: BookingState;
  /** True only when `reply` is the provider's own generic, deliberately
   * conservative filler for a just-proposed completing action ("I've
   * captured your request — a team member will confirm[...]") — used
   * because the provider has no way to know yet whether ReceptionistTools
   * will report the action as genuinely persisted (a real database row /
   * calendar event) or merely validated (see ToolResult.persisted). Never
   * set when a model generated its own reply text — that text is never
   * second-guessed here, only this specific hardcoded fallback is.
   * ReceptionistAgent uses this, together with the real post-execution
   * ToolResult, to swap in a more accurate reply when something was
   * actually persisted, without touching any other reply path. */
  completingActionReplyIsGeneric?: boolean;
  /** Set when THIS turn's customer message could not be confidently
   * interpreted deterministically — recorded purely for future human
   * review (see src/db/language-observations.ts), NEVER used to change
   * this turn's own behavior. Deliberately narrow and low-noise: only
   * fires when a specific field/intent was genuinely expected and the
   * message didn't supply it, not for ordinary FAQ chat or ambiguity
   * the model plainly handled fine — see each provider's own comment
   * for its exact trigger condition. `phrase` is the raw message,
   * truncated to fit the DB column; `context` is a short, STRUCTURED
   * summary (never raw history) of what the app already knew. */
  unclearPhraseObservation?: { phrase: string; reason: string; context: string; outcome: string };
  /** Set when this turn's reply was a knowledge REFUSAL — the customer
   * asked a business question the knowledge base could not (or could not
   * safely) answer. ReceptionistAgent records it for the operator
   * (KnowledgeService.recordGap). Never changes this turn's behavior and
   * never escalates by itself. */
  knowledgeGap?: KnowledgeGap;
}

export interface AIProviderRequest {
  business: BusinessContext;
  customer: CustomerContext;
  history: ConversationTurn[];
  message: string;
  /** Whatever ConversationManager has persisted so far — the provider
   * must treat this as already-known fact, not re-derive it from
   * `history` text. */
  bookingState: BookingState;
  /** True once this conversation has been escalated/handed off to staff.
   * A provider MAY use this to shape its reply, but enforcement is NOT
   * the provider's job — see ReceptionistAgent.handleMessage, which
   * independently blocks every action while this is true regardless of
   * what any provider proposes (a buggy provider, or a prompt-injected
   * one, can't reopen automation just by ignoring this flag). Optional so
   * existing callers/tests that predate handoff tracking are unaffected;
   * treated as false when absent. */
  handoffActive?: boolean;
  /** The tenant this conversation belongs to, when known (the persisted
   * path). Read ONLY by ReceptionistAgent, to bind `knowledge` below —
   * never by a provider. Undefined for the in-memory path. */
  tenantId?: string;
  /** Tenant-BOUND business-knowledge lookup (see src/knowledge). Supplied
   * by ReceptionistAgent when the knowledge engine is enabled; providers
   * call it, they cannot choose a tenant. Returns evidence or an explicit
   * refusal to supply any — it can never answer availability, bookings or
   * any other application state. Undefined when the engine is off, in
   * which case providers behave exactly as they did before it existed. */
  knowledge?: KnowledgeLookup;
  /** Pre-rendered, bounded, delimited customer-memory block (see src/memory).
   * Supporting DATA only — never instructions, never authority over tools,
   * availability, prices, hours, ownership or sends. Undefined when memory is
   * off or nothing relevant exists; providers then behave exactly as before. */
  memory?: string;
  /** The durable conversation this turn belongs to, when the caller uses
   * persistence (PersistedConversationManager — see src/db/persisted-conversation.ts).
   * Never read by any AIProvider implementation itself; ReceptionistAgent
   * is the only thing that uses it, to stamp create_lead/escalate
   * payloads so a DB-backed ReceptionistTools can persist a real,
   * traceable row. Undefined for the in-memory ConversationManager and
   * every existing caller — completely inert until a caller opts in. */
  conversationId?: string;
  /** Synchronous, pure availability predicate backed by the clinic
   * simulator (see src/simulator/clinic-simulator.ts's checkBookable) —
   * the ONE place a provider may ask "is this specific date/time/
   * duration genuinely free" BEFORE proposing an action, not just after.
   * Two things need this and nothing else in this codebase does:
   *   1. Recurring scheduling (Section 5-9) — EVERY occurrence must be
   *      checked before the confirmation is even shown (never silently
   *      skip a conflicting one), which requires checking availability
   *      mid-conversation, not just at final tool-execution time.
   *   2. Nothing else currently — the ordinary single-booking flow still
   *      only discovers a conflict at tool-execution time (via
   *      ReceptionistTools.requestAppointment's own check), same as
   *      before this existed; a documented, accepted limitation (not
   *      wired into the earlier in-flow check to avoid a much larger,
   *      riskier rewrite of both providers' core flow for this pass).
   * Undefined for every caller not using the clinic simulator (the
   * in-memory ConversationManager path, most tests, dev-chat.ts without
   * CLINIC_SIMULATOR_ENABLED) — a provider MUST treat its absence as "no
   * real availability data available" and, for recurring intent
   * specifically, honestly escalate rather than guess (Section 9).
   *
   * Returns a REASON, not just a boolean — genuine bug found live: an
   * occurrence beyond the reference calendar's own known ~1-year window
   * (`out_of_range`) was worded as "already taken" (`conflict`'s
   * wording) when the two were collapsed into one boolean. A recurring
   * series spanning a full year, checked against a calendar covering
   * almost exactly one year, hits this legitimately (not just a
   * theoretical edge case) — see the mission's own 6-month/3-occurrence
   * example, which spans a full year from its start date. */
  checkAvailability?: (
    date: string,
    time: string,
    durationMinutes: number,
  ) =>
    | { ok: true }
    | { ok: false; reason: "closed_day" | "outside_hours" | "out_of_range" | "conflict" };
}

export interface AIProvider {
  generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;
}

export interface ToolResult {
  success: boolean;
  /** Present on failure; safe to log, not shown verbatim to the customer. */
  error?: string;
  /** True only when `success` reflects a REAL, durable write — a row in
   * the appointments table (database-receptionist-tools.ts) or an actual
   * Google Calendar event (google-calendar-receptionist-tools.ts) — that
   * now occupies the slot for everyone else, not merely "this would be
   * allowed." createSimulatedReceptionistTools never sets this (its own
   * docstring: "nothing is written to a database or sent anywhere
   * real") — `success: true` there means validated-only. Also left unset
   * for a real backend's own no-op/limitation paths that still report
   * success without a matching write (e.g. Google Calendar's
   * requestReschedule/requestCancellation, which have no linked event to
   * act on yet — see that file's docstring), and for create_lead/escalate
   * (never claimed as "your appointment," so the distinction doesn't
   * apply). ReceptionistAgent uses this — not `success` alone — to decide
   * whether a completing action's fallback reply may say something more
   * concrete than "a team member will confirm": see its own comment for
   * why. */
  persisted?: boolean;
  /** Present on a SPECIFIC, narrow class of failure: the database
   * rejected a request_appointment because another customer's booking
   * won the race for the same slot (see src/db/appointments.ts's
   * exclusion-constraint conflict, surfaced through
   * src/tools/database-receptionist-tools.ts). This is a NORMAL,
   * expected outcome — not a real failure — so ReceptionistAgent checks
   * for it before its usual "any failed action escalates" handling and
   * responds with an accurate, application-composed conflict message
   * plus real alternatives instead. Every other failure mode (a bad
   * phone number, a DB connection error, anything else) leaves this
   * undefined and is completely unaffected — still escalates exactly as
   * before. Deliberately narrow rather than a general "don't escalate"
   * flag, so this can't accidentally suppress escalation for a genuine
   * problem. */
  recoverable?: {
    reason: "slot_conflict";
    /** Real, database-checked alternative times on the same day,
     * "HH:MM" 24-hour — never guessed or fabricated by a model. */
    alternativeTimes: string[];
    /** Richer form: real date+time alternatives that may span MULTIPLE
     * days, not just the originally-requested one — what the clinic
     * simulator's findNextAvailable produces when the requested day
     * itself has no more room. When present, ReceptionistAgent prefers
     * this over `alternativeTimes` for composing the conflict reply;
     * `alternativeTimes` stays populated too (mirroring this list's own
     * times) so an older caller reading only that field still works. */
    alternativeSlots?: { date: string; time: string }[];
  };
}

/**
 * The only surface that can produce a real side effect. Every action an
 * AIProvider proposes must route through one of these. In this milestone
 * every implementation is simulated (no CRM/database writes — that's a
 * later milestone) but the interface is what a real implementation would
 * satisfy, so swapping one in later doesn't touch ReceptionistAgent.
 */
export interface ReceptionistTools {
  createLead(payload: CreateLeadPayload): Promise<ToolResult>;
  requestAppointment(payload: RequestAppointmentPayload): Promise<ToolResult>;
  requestReschedule(payload: RequestReschedulePayload): Promise<ToolResult>;
  requestCancellation(payload: RequestCancellationPayload): Promise<ToolResult>;
  /** Only genuinely, safely implemented by the clinic-simulator-backed
   * tools (src/tools/clinic-simulator-receptionist-tools.ts) — see
   * RequestRecurringAppointmentPayload's docstring and Section 9's own
   * "if some part of recurring scheduling cannot safely be implemented,
   * do NOT fake it" requirement. Every OTHER implementation returns an
   * honest failure; in practice neither provider ever proposes this
   * action against a backend that can't back it (see
   * AIProviderRequest.checkAvailability — a provider only builds this
   * action when that's present, and only the simulator sets it), so this
   * is a defensive fallback, not a live path. */
  requestRecurringAppointment(payload: RequestRecurringAppointmentPayload): Promise<ToolResult>;
  escalate(payload: EscalatePayload): Promise<ToolResult>;
}

export interface ExecutedAction {
  action: ReceptionistAction;
  result: ToolResult;
}

export interface ReceptionistAgentResult {
  reply: string;
  actionsTaken: ExecutedAction[];
  /** True if the agent overrode the provider's reply because an action
   * failed, the provider failed, or its response couldn't be trusted. */
  safetyOverride: boolean;
  /** The booking state after this turn. Callers must persist this (e.g.
   * via ConversationManager.setBookingState) before the next turn — on a
   * safety fallback this is the pre-turn state, unchanged, since nothing
   * the failed/untrusted provider proposed should be trusted. */
  bookingState: BookingState;
  /** True if the conversation is (now) in a staff-handoff state after
   * this turn. Callers MUST persist this (e.g. via
   * ConversationManager.setHandoffActive) and pass it back as
   * `handoffActive` on the next turn's AIProviderRequest — that's what
   * makes the block durable across turns, not just within the one that
   * escalated. Only becomes false again via an explicit resume
   * (ConversationManager.resumeAutomation), never automatically and never
   * from anything the customer says in chat. */
  handoffActive: boolean;
}
