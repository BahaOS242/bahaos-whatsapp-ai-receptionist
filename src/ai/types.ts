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

export type BookingIntent = "book_appointment" | "reschedule_appointment" | "cancel_appointment";

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
}

export type ReceptionistActionType =
  | "create_lead"
  | "request_appointment"
  | "request_reschedule"
  | "request_cancellation"
  | "escalate";

export interface CreateLeadPayload {
  name: string;
  phone?: string;
  serviceInterest?: string;
}

export interface RequestAppointmentPayload {
  name: string;
  phone: string;
  service: string;
  preferredDate: string;
  preferredTime: string;
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
}

export type ReceptionistAction =
  | { type: "create_lead"; payload: CreateLeadPayload }
  | { type: "request_appointment"; payload: RequestAppointmentPayload }
  | { type: "request_reschedule"; payload: RequestReschedulePayload }
  | { type: "request_cancellation"; payload: RequestCancellationPayload }
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
}

export interface AIProvider {
  generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;
}

export interface ToolResult {
  success: boolean;
  /** Present on failure; safe to log, not shown verbatim to the customer. */
  error?: string;
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
}
