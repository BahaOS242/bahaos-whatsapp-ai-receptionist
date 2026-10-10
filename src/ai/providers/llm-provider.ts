import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResponse,
  BookingIntent,
  BookingState,
  BusinessContext,
  CompletedBookingSnapshot,
  ReceptionistAction,
} from "../types";
import type { LlmChatClient, LlmChatMessage, LlmToolCall } from "./llm-chat-client";
import {
  describeInvalidTime,
  formatTime12h,
  isWithinOperatingWindow,
  validateAppointmentTime,
} from "../business-hours";
import type { BusinessHoursValidation } from "../business-hours";
import { describeUnavailable, findAlternativeTimes, isSlotAvailable } from "../availability";
import { EMERGENCY_RE, ESCALATE_RE } from "../escalation-triggers";
import { computePendingAction, describeNextField, nextRequiredField } from "../booking-progression";
import {
  bookingStateUnchangedForConfirmation,
  composeConfirmationPrompt,
  composeRecurringConfirmationOrConflict,
  composeRecurringUnavailableEscalation,
  isConfirmedCompletingAction,
  looksLikeConfirmationPrompt,
} from "../booking-confirmation";
import { isApproval, isPureApproval } from "../approval-purity";
import { AFFIRMATIVE_RE, NEGATIVE_RE, extractStatedFields } from "../message-field-extraction";
import { extractPhone } from "../phone";
import { flipMeridiemHour, normalizeTime } from "../date-time";
import { TIME_CLARIFICATION_REPLY } from "../time-clarification";
import { truncatePhrase } from "../unclear-phrase";
import { generateOccurrenceDates, RECURRING_OCCURRENCE_COUNT } from "../recurrence";
import { MAX_MEMORY_PROMPT_CHARS } from "../../memory/types";
import { verifyReplyGrounding } from "../../knowledge/answer-guard";
import { parseMoneyCents } from "../../knowledge/claims";
import { buildKnowledgeSection, KNOWLEDGE_GROUNDING_RULES } from "../../knowledge/evidence-prompt";
import { composeConflictReply, composeNoEvidenceReply } from "../../knowledge/replies";
import type { RetrievalResult } from "../../knowledge/types";
import {
  createLeadSchema,
  escalateSchema,
  requestAppointmentSchema,
  requestCancellationSchema,
  requestRecurringAppointmentSchema,
  requestRescheduleSchema,
  updateBookingProgressSchema,
} from "./action-schemas";

/**
 * Thrown when the model's response can't be trusted — no text and no
 * tool calls, or a tool call with unparseable/invalid arguments.
 * ReceptionistAgent treats this exactly like an LLM provider failure: it
 * never partially trusts a response, because a customer-facing "reply"
 * that doesn't match what the model *actually* validly requested is
 * precisely the failure mode the safety requirements are about.
 */
export class MalformedLlmResponseError extends Error {}

const COMPLETING_ACTION_TYPES = new Set<ReceptionistAction["type"]>([
  "request_appointment",
  "request_reschedule",
  "request_cancellation",
  "request_recurring_appointment",
]);

/** Objective 4 — how many CONSECUTIVE genuinely-unclear turns (see
 * bookingState.unclearTurnCount's docstring) are tolerated before the
 * application proactively escalates instead of repeating the same
 * generic clarification question forever. 2 means: the first unclear
 * turn still gets one honest "could you say that again?" chance (a
 * single garbled message is normal), and the SECOND consecutive one
 * escalates — never a third silent repeat. */
const UNCLEAR_TURN_ESCALATION_THRESHOLD = 2;

const GENUINELY_UNCLEAR_REPLY = "Sorry, could you say that again?";

/** The one completing action type that actually matches each intent —
 * used by the duplicate-booking guard below to catch a mismatch, not
 * just an outright missing intent. */
const COMPLETING_ACTION_TYPE_FOR_INTENT: Record<BookingIntent, ReceptionistAction["type"]> = {
  book_appointment: "request_appointment",
  reschedule_appointment: "request_reschedule",
  cancel_appointment: "request_cancellation",
  book_recurring_appointment: "request_recurring_appointment",
};

// AFFIRMATIVE_RE/NEGATIVE_RE moved to message-field-extraction.ts (see
// import above) so its own pendingCorrection early-branch can share the
// exact same yes/no vocabulary this file already trusts for its
// auto-confirm/decline bypasses, rather than two driftable copies.

const DECLINE_REPLY =
  "No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?";

/** Narrow, explicitly-enumerated past-tense/completed phrasing — same
 * "no general dictionary" shape as AFFIRMATIVE_RE/NEGATIVE_RE above.
 * Deliberately requires COMPLETED phrasing ("I've captured", "you're all
 * set") so it never fires on legitimate in-progress language ("let me
 * submit this for you now", "I'll capture your request") — see the
 * hallucination guard in generateResponse for how this is used: only to
 * flag prose claiming a booking is already done, never to police wording
 * in general. */
const HALLUCINATED_COMPLETION_RE =
  /\bi'?ve (captured|submitted|booked|scheduled|confirmed)\b|\byou'?re all set\b|\byour appointment is (booked|confirmed|scheduled)\b|\bi'?ve got you (booked|scheduled|down)\b/i;

/** Shared business-hours check for whichever intent is presenting a
 * confirmation — extracted so the hours-validation-before-confirmation
 * block can run the exact same check twice: once for the customer's
 * stated time, and once (only on failure) for a candidate AM/PM-flipped
 * correction, without duplicating the intent-dispatch ternary. `service`
 * only matters for book_appointment (duration determines whether the
 * appointment would run past closing); reschedule_appointment has no
 * service field on its own action payload (see RequestReschedulePayload)
 * and is checked as a bare hours-window question. */
function validateHoursForIntent(
  business: BusinessContext,
  intent: BookingIntent | undefined,
  date: string,
  time: string,
  service: string | undefined,
): BusinessHoursValidation | { valid: true } {
  if (intent === "book_appointment") {
    return validateAppointmentTime(
      business,
      date,
      time,
      business.services.find((s) => s.name === service)?.durationMinutes ?? 0,
    );
  }
  if (intent === "reschedule_appointment") {
    return isWithinOperatingWindow(business, date, time);
  }
  return { valid: true };
}

/** Application-owned decline safety net, layer 1 of 2 (see layer 2 inline
 * in generateResponse's tool-call loop): when the customer has just been
 * asked (via pendingAction) to confirm a fully-known booking and replies
 * with an unambiguous decline, the model is never even consulted — same
 * bypass-the-model-entirely shape as buildAutoConfirmToolCall, for the
 * exact same reason (never depend on the model reliably doing the right
 * thing with a yes/no answer). pendingAction is cleared but every other
 * known field survives, so the customer can correct or continue instead
 * of having to restate the whole booking. `justDeclined: true` is set so
 * the VERY NEXT turn's extraction gives the customer's next word the
 * same correction license an explicit "actually"/"instead" marker
 * already has — see BookingState.justDeclined's docstring for the bug
 * this closes. */
function buildDeclineResponse(
  bookingState: BookingState,
  message: string,
): AIProviderResponse | undefined {
  if (bookingState.pendingAction !== "confirm_service") return undefined;
  if (!NEGATIVE_RE.test(message)) return undefined;

  const { pendingAction: _pendingAction, ...preserved } = bookingState;
  return { reply: DECLINE_REPLY, actions: [], bookingState: { ...preserved, justDeclined: true } };
}

/** Builds the completing action directly from bookingState when the
 * customer has just given an unambiguous "yes" to the application's own
 * confirm-and-book prompt (pendingAction === "confirm_service") and every
 * field required for the current intent is already known — see
 * generateResponse for why this bypasses the model entirely rather than
 * asking it to decide. Returns undefined (falls through to a normal model
 * call) for anything less than fully unambiguous: a different intent's
 * pendingAction, a still-incomplete booking, a reply that isn't clearly
 * affirmative, or — critically — a reply that ALSO changed something
 * confirmation-relevant this turn (see bookingStateUnchangedForConfirmation
 * in booking-confirmation.ts): "yes, actually 3pm instead" must never
 * auto-book the NEW time on the strength of an OLD confirmation — Objective
 * 2's "any material change invalidates the previous confirmation." `before`
 * is the state as it stood going into this turn; `after` is the same state
 * once this turn's own deterministic extraction has been merged in. */
function buildAutoConfirmToolCall(
  before: BookingState,
  after: BookingState,
  message: string,
): LlmToolCall | undefined {
  if (before.pendingAction !== "confirm_service") return undefined;
  if (!bookingStateUnchangedForConfirmation(before, after)) return undefined;
  const bookingState = after;
  if (!bookingState.intent || nextRequiredField(bookingState) !== undefined) return undefined;
  if (!AFFIRMATIVE_RE.test(message) || !isPureApproval(message)) return undefined;

  switch (bookingState.intent) {
    case "book_appointment":
      return {
        id: "auto_confirm",
        name: "request_appointment",
        argumentsJson: JSON.stringify({
          name: bookingState.name,
          phone: bookingState.phone,
          service: bookingState.service,
          preferredDate: bookingState.date,
          preferredTime: bookingState.time,
        }),
      };
    case "reschedule_appointment":
      return {
        id: "auto_confirm",
        name: "request_reschedule",
        argumentsJson: JSON.stringify({
          name: bookingState.name,
          phone: bookingState.phone,
          newPreferredDate: bookingState.date,
          newPreferredTime: bookingState.time,
        }),
      };
    case "cancel_appointment":
      return {
        id: "auto_confirm",
        name: "request_cancellation",
        argumentsJson: JSON.stringify({ name: bookingState.name, phone: bookingState.phone }),
      };
    case "book_recurring_appointment":
      // Deliberately NOT handled here — a recurring series needs
      // occurrence generation + per-occurrence availability checking
      // (see buildRecurringAutoConfirmToolCall below), which this
      // function has no access to. Falling through to the model would
      // violate Section 11 ("the model's prose is never authoritative");
      // generateResponse tries the dedicated recurring path FIRST and
      // never reaches this function for a recurring intent's "yes" at
      // all in practice — see there.
      return undefined;
  }
}

/** Recurring-scheduling analog of buildAutoConfirmToolCall above — same
 * "the customer just said yes to a confirmation and nothing changed"
 * bypass, but ALSO generates and checks every occurrence via
 * `checkAvailability` (the clinic simulator) before ever constructing
 * the action, since Section 6's non-negotiable requirement is that NO
 * occurrence is silently skipped: if any conflict, this returns
 * `undefined` (never partially completes) and the caller is expected to
 * surface the conflict instead — see generateResponse. Undefined
 * `checkAvailability` (no clinic simulator wired) means recurring
 * scheduling cannot be safely completed at all — Section 9's "do NOT
 * fake it" — so this returns undefined unconditionally in that case,
 * and generateResponse falls through to an honest escalation instead of
 * ever calling the model to decide. */
function buildRecurringAutoConfirmToolCall(
  before: BookingState,
  after: BookingState,
  message: string,
  checkAvailability: AIProviderRequest["checkAvailability"],
  business: BusinessContext,
): LlmToolCall | undefined {
  if (before.pendingAction !== "confirm_service") return undefined;
  if (!bookingStateUnchangedForConfirmation(before, after)) return undefined;
  const bookingState = after;
  if (bookingState.intent !== "book_recurring_appointment") return undefined;
  if (nextRequiredField(bookingState) !== undefined) return undefined;
  if (!AFFIRMATIVE_RE.test(message) || !isPureApproval(message)) return undefined;
  if (!checkAvailability) return undefined;

  const service = business.services.find((s) => s.name === bookingState.service);
  if (!service) return undefined;

  const occurrenceDates = generateOccurrenceDates(
    bookingState.date!,
    bookingState.recurrenceIntervalMonths!,
    RECURRING_OCCURRENCE_COUNT,
  );
  const allAvailable = occurrenceDates.every(
    (date) => checkAvailability(date, bookingState.time!, service.durationMinutes).ok,
  );
  if (!allAvailable) return undefined;

  return {
    id: "auto_confirm_recurring",
    name: "request_recurring_appointment",
    argumentsJson: JSON.stringify({
      name: bookingState.name,
      phone: bookingState.phone,
      service: bookingState.service,
      startDate: bookingState.date,
      startTime: bookingState.time,
      recurrenceIntervalMonths: bookingState.recurrenceIntervalMonths,
      occurrenceDates,
    }),
  };
}

/** Filled in by generateResponseCore when a knowledge lookup produced
 * GROUNDED evidence, so the wrapper below can verify the model's reply
 * against exactly that evidence. */
interface KnowledgeHolder {
  grounded?: RetrievalResult;
}

const NO_RETRIEVAL: RetrievalResult = {
  outcome: "grounded",
  evidence: [],
  considered: [],
  conflicts: [],
  topScore: 0,
  topCoverage: 0,
  embeddingModel: null,
  forbiddenAmountsCents: [],
  allowedAmountsCents: [],
};

export class LLMProvider implements AIProvider {
  constructor(private readonly client: LlmChatClient) {}

  /**
   * Knowledge-engine wrapper (only active when request.knowledge is
   * supplied). The model's reply is NEVER trusted to have obeyed "answer
   * only from the evidence": any price in it that the application cannot
   * account for — hallucinated, taken from a losing source, or coaxed out
   * by an injected document — causes the whole reply to be replaced with
   * the deterministic refusal, and no actions from that turn are kept.
   */
  async generateResponse(request: AIProviderRequest): Promise<AIProviderResponse> {
    const holder: KnowledgeHolder = {};
    const response = await this.generateResponseCore(request, holder);
    if (!request.knowledge) return response;

    const verdict = verifyReplyGrounding({
      reply: response.reply,
      customerMessage: request.message,
      businessPricesCents: request.business.services
        .map((s) => parseMoneyCents(s.priceLabel))
        .filter((c): c is number => c !== undefined),
      result: holder.grounded ?? NO_RETRIEVAL,
    });
    if (verdict.ok) return response;

    console.warn(JSON.stringify({ scope: "knowledge", event: "answer_guard_blocked", reason: verdict.reason }));
    const { unclearTurnCount: _u, ...state } = request.bookingState;
    return {
      reply: composeNoEvidenceReply({ midBooking: !!request.bookingState.intent }),
      actions: [],
      bookingState: state,
      knowledgeGap: { reason: "answer_guard", question: "" },
    };
  }

  private async generateResponseCore(request: AIProviderRequest, holder: KnowledgeHolder): Promise<AIProviderResponse> {
    // Application-owned state, step 1: deterministically extract whatever
    // the customer's raw message tells us — independent of the model,
    // and computed BEFORE the model is even consulted, so everything
    // downstream (the system prompt, the auto-confirm/decline safety
    // nets) sees the customer's latest answer immediately, regardless of
    // whether the model would have reliably reported it itself. See
    // src/ai/message-field-extraction.ts for exactly what's extracted and
    // why each field is gated the way it is.
    const extractedThisTurn = extractStatedFields(request.business, request.message, request.bookingState);
    let bookingState: BookingState = { ...request.bookingState, ...extractedThisTurn };

    // Layer 1 of the decline safety net — see buildDeclineResponse. Checked
    // before anything else, same as the affirmative bypass below.
    const declineResponse = buildDeclineResponse(bookingState, request.message);
    if (declineResponse) return declineResponse;

    // Section 9: recurring scheduling can only be safely completed when
    // a clinic simulator is wired in (request.checkAvailability present)
    // — every occurrence must be genuinely checked, never guessed. Once
    // the intent AND an interval are both recognized, that's already
    // enough to know whether this can be honored at all — escalating
    // immediately (rather than collecting service/date/time/name/phone
    // first, just to escalate anyway) is both more honest and more
    // respectful of the customer's time. Bypasses the model entirely,
    // same shape as the decline/auto-confirm bypasses in this file —
    // nothing here depends on what else the model might say, and
    // nothing here ever claims a recurring booking exists.
    if (
      bookingState.intent === "book_recurring_appointment" &&
      bookingState.recurrenceIntervalMonths &&
      !request.checkAvailability
    ) {
      return {
        reply: composeRecurringUnavailableEscalation(bookingState.service, bookingState.recurrenceIntervalMonths),
        actions: [
          {
            type: "escalate",
            payload: { reason: "recurring scheduling requested but not safely completable on this backend" },
          },
        ],
        bookingState: {},
      };
    }

    // Item 5 — unknown-phrase learning foundation candidate. Two cases,
    // both requiring this message's deterministic extraction to have
    // found NOTHING at all (no field, no intent, no correction):
    //   1. A specific field was actively being asked for
    //      (nextRequiredField on the state going INTO this turn) and
    //      the message didn't supply it.
    //   2. No booking intent exists yet AT ALL and this message doesn't
    //      even establish one — the mission's own primary example
    //      ("unknown Bahamian-style phrasing") is exactly THIS case,
    //      not case 1, since it typically arrives as the customer's
    //      very first message. Excludes plain greetings/thanks and
    //      anything EMERGENCY_RE/ESCALATE_RE already recognizes — those
    //      are genuinely understood, not unclear, even though this
    //      provider has no deterministic FAQ classifier the way
    //      DevRuleBasedAIProvider does to rule out an ordinary FAQ
    //      question here too. Accepted tradeoff: an FAQ the model
    //      answers fine may still get flagged here and land in the
    //      review queue as noise — cheap for a human to dismiss, and
    //      far better than silently missing the case this feature
    //      exists for. See AIProviderResponse.unclearPhraseObservation's
    //      docstring; only actually attached to the final response near
    //      the bottom of this method, and only if nothing else explains
    //      the turn (no completing action, no escalate).
    const priorNextField = nextRequiredField(request.bookingState);
    const extractedNothing = Object.values(extractedThisTurn).every((v) => v === undefined);
    const isPlainGreetingOrThanks = /^\s*(hi|hello|hey|thanks|thank you|thank u)[!.,\s]*$/i.test(request.message);
    const eligibleTrigger = priorNextField
      ? `no recognized field found while "${priorNextField}" was being asked for`
      : !request.bookingState.intent && !isPlainGreetingOrThanks
        ? "no recognized intent or field matched this message"
        : undefined;
    const unclearPhraseCandidate =
      eligibleTrigger &&
      extractedNothing &&
      !AFFIRMATIVE_RE.test(request.message) &&
      !NEGATIVE_RE.test(request.message) &&
      !EMERGENCY_RE.test(request.message) &&
      !ESCALATE_RE.test(request.message)
        ? {
            phrase: truncatePhrase(request.message),
            reason: eligibleTrigger,
            context: `intent=${request.bookingState.intent ?? "none"}; nextRequiredField=${priorNextField ?? "none"}`,
            outcome: "asked_for_clarification",
          }
        : undefined;

    let systemPrompt = buildSystemPrompt({ ...request, bookingState });
    // Customer memory: low-authority, delimited DATA appended after every rule. Absent => prompt unchanged.
    if (request.memory && request.memory.length <= MAX_MEMORY_PROMPT_CHARS) systemPrompt = `${systemPrompt}\n\n${request.memory}`;
    const messages: LlmChatMessage[] = [
      ...request.history.map((turn): LlmChatMessage => ({
        role: turn.role === "customer" ? "user" : "assistant",
        content: turn.content,
      })),
      { role: "user", content: request.message },
    ];

    // Mirror image of the escalation safety net: once everything required
    // is known and the customer was already asked (via pendingAction) to
    // confirm, an unambiguous "yes" must not depend on the model reliably
    // converting it into a request_appointment/reschedule/cancellation
    // call — observed live (openai/gpt-4o-mini via OpenRouter) repeating
    // the same confirmation question indefinitely instead of ever calling
    // the tool. When conditions are unambiguous, a synthetic tool call is
    // used INSTEAD of asking the model at all — it then flows through the
    // exact same hours/availability/phone validation below as any real
    // tool call, so none of that logic is duplicated. Saves a network
    // call in the common case, too.
    const autoConfirmCall =
      buildAutoConfirmToolCall(request.bookingState, bookingState, request.message) ??
      buildRecurringAutoConfirmToolCall(
        request.bookingState,
        bookingState,
        request.message,
        request.checkAvailability,
        request.business,
      );
    // Business knowledge (RAG). Consulted only for genuine knowledge
    // questions — never on a confirmation the application is about to
    // auto-confirm, and the gate itself skips yes/no/names/times/booking
    // fields/scheduling requests. A refusal or conflict is answered
    // deterministically and the model is not asked at all.
    let knowledgeConsulted = false;
    if (request.knowledge && !autoConfirmCall) {
      const lookup = await request.knowledge({
        message: request.message,
        history: request.history,
        context: {
          hasActiveIntent: !!bookingState.intent,
          hasPendingConfirmation: !!request.bookingState.pendingAction,
          extractedBookingField: Object.entries(extractedThisTurn).some(([k, v]) => k !== "intent" && v !== undefined),
        },
      });
      if (lookup.consulted) {
        knowledgeConsulted = true;
        const { unclearTurnCount: _unclear, ...cleanState } = bookingState;
        const midBooking = !!bookingState.intent;
        if (lookup.outcome === "no_evidence") {
          return {
            reply: composeNoEvidenceReply({ midBooking }),
            actions: [],
            bookingState: cleanState,
            knowledgeGap: { reason: lookup.noEvidenceReason ?? "below_threshold", question: "" },
          };
        }
        if (lookup.outcome === "conflict") {
          return {
            reply: composeConflictReply(lookup.conflicts, request.business, { midBooking }),
            actions: [],
            bookingState: cleanState,
            knowledgeGap: { reason: "conflict", question: "" },
          };
        }
        holder.grounded = lookup;
        systemPrompt = [systemPrompt, ...KNOWLEDGE_GROUNDING_RULES, "", buildKnowledgeSection(lookup)].join("\n");
      }
    }

    const result = autoConfirmCall
      ? { content: null, toolCalls: [autoConfirmCall] }
      : await this.client.chat({ systemPrompt, messages });

    if (result.content === null && result.toolCalls.length === 0) {
      throw new MalformedLlmResponseError("LLM response had no text and no tool calls.");
    }

    const actions: ReceptionistAction[] = [];
    let reportedIntent: BookingIntent | undefined;
    let hoursRejectionReply: string | undefined;
    let availabilityRejectionReply: string | undefined;
    let phoneRejectionReply: string | undefined;
    let timeRejectionReply: string | undefined;
    let declineOverrideReply: string | undefined;
    let duplicateBookingReply: string | undefined;
    let confirmationRequiredReply: string | undefined;

    for (const toolCall of result.toolCalls) {
      if (toolCall.name === "update_booking_progress") {
        const parsed = parseBookingProgress(toolCall);
        if (!parsed) {
          throw new MalformedLlmResponseError(
            "LLM update_booking_progress call had invalid or unparseable arguments.",
          );
        }
        reportedIntent = parsed.intent;
        continue;
      }

      const parsedAction = parseToolCall(toolCall);
      if (!parsedAction) {
        throw new MalformedLlmResponseError(
          `LLM tool call "${toolCall.name}" had invalid or unparseable arguments.`,
        );
      }

      // Duplicate-booking guard: bookingState.bookingJustCompleted is set
      // (instead of a full reset) the moment a completing action last
      // succeeded, and survives until a NEW intent is established
      // deterministically FROM THE CUSTOMER'S OWN MESSAGE (see
      // deriveBookingState). Deliberately checks bookingState.intent only
      // — NOT reportedIntent — even though reportedIntent is available
      // here: observed live, a model called update_booking_progress
      // (reporting book_appointment "out of habit," per its own
      // instructions) in the SAME response as a hallucinated repeat
      // request_appointment, which let an EARLIER version of this guard
      // (one that also checked `!reportedIntent`) miss it entirely — a
      // real duplicate booking was created. The model's own tool-call
      // reporting is exactly the untrusted signal the rest of this file
      // never relies on for anything else; this guard is no exception.
      // Checked first, before the decline/phone/time/hours/availability
      // checks below, since there's nothing further to validate once we
      // already know this action shouldn't proceed at all.
      if (COMPLETING_ACTION_TYPES.has(parsedAction.type) && bookingState.bookingJustCompleted) {
        if (!bookingState.intent) {
          duplicateBookingReply =
            "That request has already been submitted, so there's nothing more for me to send — a team member will follow up. Let me know if you'd like to start something else!";
          continue; // drop the action — it is never returned to the agent
        }
        // A fresh intent WAS established (e.g. by detectPostCompletionReschedule
        // — see message-field-extraction.ts), but the model proposed the
        // WRONG action type for it — observed live, a customer's post-
        // completion time correction ("actually make it 3pm not 2pm")
        // deterministically produced intent: "reschedule_appointment",
        // yet the model still called request_appointment. Nothing else in
        // this file checked that an action's type actually matches the
        // intent it claims to serve, so it succeeded — creating a SECOND,
        // separate appointment record instead of modifying the original
        // one. Dropped here the same way, with the accurate confirm
        // prompt (which already knows the reschedule/cancel verb — see
        // composeConfirmationPrompt in booking-confirmation.ts) standing
        // in for whatever the model said, priming a "yes" that correctly
        // auto-confirms into the RIGHT action type next turn.
        if (COMPLETING_ACTION_TYPE_FOR_INTENT[bookingState.intent] !== parsedAction.type) {
          duplicateBookingReply = composeConfirmationPrompt(request.business, bookingState);
          continue; // drop the action — it is never returned to the agent
        }
      }

      // Layer 2 of the decline safety net: buildDeclineResponse (layer 1)
      // only catches the case where pendingAction was reliably tracked.
      // This catches it even when it wasn't — observed live, a model
      // proposed request_appointment in direct response to the customer
      // saying "no", using name/phone it had reconstructed from raw
      // conversation history despite bookingState never having recorded
      // them. Regardless of how the model got here or what state tracking
      // says, an explicit decline must never let a completing action
      // through — "regardless of what the LLM returns" is the literal
      // requirement this satisfies.
      if (COMPLETING_ACTION_TYPES.has(parsedAction.type) && NEGATIVE_RE.test(request.message)) {
        declineOverrideReply = DECLINE_REPLY;
        continue; // drop the action — it is never returned to the agent
      }

      // The model reports whatever digits/format the customer happened to
      // type — never trusted verbatim. Actions with a REQUIRED phone are
      // rejected outright if it doesn't normalize to a real number (same
      // "explain, ask again, preserve everything else" shape as the hours/
      // availability checks below); create_lead's phone is optional, so an
      // unnormalizable one is just dropped rather than blocking the lead.
      const phoneCheck = normalizeActionPhone(request.business, parsedAction);
      if (phoneCheck.rejected) {
        phoneRejectionReply =
          "That phone number doesn't look complete — could you send it again, with the area code?";
        continue; // drop the action — it is never returned to the agent
      }

      // Same principle as the phone check above, for time: the model
      // might report "2:00 PM" instead of the canonical "14:00" — never
      // trusted verbatim. Normalizing BEFORE the hours check (next) means
      // a validly-stated but non-canonically-formatted time is accepted
      // rather than falling through to hours validation's strict "HH:MM"
      // parser and producing a misleading "outside our hours" rejection
      // for a time that was actually fine — see date-time.ts's
      // normalizeTime for the exact live failure this fixes.
      const timeCheck = normalizeActionTime(phoneCheck.action);
      if (timeCheck.rejected) {
        timeRejectionReply =
          "That time doesn't look valid — could you give me a specific time, like 2pm or 14:00?";
        continue; // drop the action — it is never returned to the agent
      }
      const action = timeCheck.action;

      // Application-level hours validation is authoritative regardless of
      // what the model decided — this is a best-effort check for a good
      // in-conversation rejection message; ReceptionistTools re-checks
      // independently and is the actual hard backstop (see
      // src/tools/receptionist-tools.ts), so the model can never cause a
      // real "success" to be reported for an out-of-hours request even if
      // this check were somehow skipped.
      const hoursCheck = checkActionHours(request.business, action);
      if (hoursCheck && !hoursCheck.validation.valid) {
        hoursRejectionReply = describeInvalidTime(
          request.business,
          hoursCheck.validation,
          hoursCheck.date,
          hoursCheck.time,
        );
        continue; // drop the action — it is never returned to the agent
      }

      // Same principle, one step further: the model can never be trusted
      // to know whether an in-hours slot is actually still open — only
      // the application knows about existing holds (src/ai/availability.ts).
      // A "yes, that time works" reply is replaced with the real answer
      // (and real alternatives) before it ever reaches the customer;
      // ReceptionistTools independently re-checks this too.
      const availabilityCheck = checkActionAvailability(request.business, action);
      if (availabilityCheck && !availabilityCheck.available) {
        availabilityRejectionReply = describeUnavailable(
          availabilityCheck.date,
          availabilityCheck.time,
          availabilityCheck.alternatives,
        );
        continue; // drop the action — it is never returned to the agent
      }

      // THE hard gate — Objective 2's non-negotiable requirement, enforced
      // here regardless of anything the model said or did: a completing
      // action is only ever allowed through if the application's OWN
      // tracked state already had a confirmation pending BEFORE this turn,
      // nothing confirmation-relevant changed this turn, and this action's
      // values exactly match what was pending — see isConfirmedCompletingAction
      // in booking-confirmation.ts. This is what makes the auto-confirm
      // synthetic call above merely a convenience, not the enforcement
      // point: a real model call that independently decides to call
      // request_appointment (whether from a genuine "book it" reply, a
      // hallucination, or anything else) is held to the EXACT same
      // standard. Checked LAST, after hours/availability — an invalid or
      // unavailable proposal still gets its own specific, accurate
      // rejection message (and the matching date/time-clearing recovery
      // below) rather than a generic "please confirm" prompt; this gate
      // only ever fires for a proposal that would otherwise be genuinely
      // bookable, and blocks it purely for lacking real confirmation.
      if (
        COMPLETING_ACTION_TYPES.has(action.type) &&
        (!isConfirmedCompletingAction(request.bookingState, bookingState, action) ||
          // a hedged approval ("Yes, but …", "yes?") never authorizes a model-proposed completion
          (isApproval(request.message) && !isPureApproval(request.message)))
      ) {
        confirmationRequiredReply = composeConfirmationPrompt(request.business, bookingState);
        continue; // drop the action — it is never returned to the agent
      }

      actions.push(action);
    }

    // Safety net: an explicit request for a human (or a described
    // emergency) must never depend on the model remembering to call
    // escalate — DevRuleBasedAIProvider treats these phrases as
    // unconditionally authoritative (see escalation-triggers.ts), and
    // LLMProvider holds itself to the same guarantee rather than trusting
    // the model's own judgment on whether to hand off. Only fires if the
    // model didn't already propose an escalate action itself this turn.
    let escalationSafetyReply: string | undefined;
    if (!actions.some((a) => a.type === "escalate")) {
      if (EMERGENCY_RE.test(request.message)) {
        escalationSafetyReply = request.business.policies.emergencyPolicy;
        actions.push({ type: "escalate", payload: { reason: "possible dental emergency" } });
      } else if (ESCALATE_RE.test(request.message)) {
        escalationSafetyReply = request.business.escalationHandoffMessage;
        actions.push({
          type: "escalate",
          payload: { reason: "customer explicitly asked for a person" },
        });
      }
    }

    bookingState = deriveBookingState(bookingState, reportedIntent, actions);
    if (hoursRejectionReply) {
      // The proposed time was rejected — preserve everything except
      // date/time, so the customer isn't asked to repeat service/name/
      // phone.
      const { date: _date, time: _time, ...preserved } = bookingState;
      bookingState = preserved;
    } else if (availabilityRejectionReply) {
      // The day itself is fine — only this specific time is already
      // held — so only time is cleared; date/service/name/phone survive.
      const { time: _time, ...preserved } = bookingState;
      bookingState = preserved;
    }

    // Application-owned state, step 2: pendingAction is computed fresh
    // every turn from the final state above — never trusted from the
    // model — so it's always exactly "confirm_service" when there's an
    // active intent and nothing left to ask, and cleared otherwise. This
    // also means the fallback-reply path below no longer needs to set it
    // as a special case: whichever reply the customer sees, the state
    // this turn produces is correct regardless.
    bookingState = applyPendingAction(bookingState);

    // Hallucination guard: the model's prose is never trusted as proof a
    // booking happened — only a completing action actually being proposed
    // this turn (request_appointment/reschedule/cancellation, present in
    // `actions`) counts as real. Observed live: the model told the
    // customer "I've captured your request... a team member will confirm
    // shortly" without ever calling request_appointment at all — nothing
    // in the rejection checks above catches this, since there was no
    // action to reject in the first place. When prose claims a completion
    // that didn't happen, it's discarded here (falls through to the
    // accurate, application-composed reply below) rather than shown to
    // the customer as-is.
    const claimsCompletionWithoutAction =
      result.content !== null &&
      HALLUCINATED_COMPLETION_RE.test(result.content) &&
      !actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type));

    // Genuine bug found live: the turn where every required field FIRST
    // becomes complete (pendingAction newly turns "confirm_service" —
    // was NOT already pending before this turn) is exactly where a
    // confirmation gets presented for the first time — and until now,
    // the MODEL's own free text was trusted for it. Observed live: a
    // customer said "actually, book the other one instead" after
    // choosing a filling — the deterministic layer correctly has no way
    // to resolve "the other one" (no service name literally in the
    // message) and correctly LEFT bookingState.service as "Basic
    // filling", exactly as it should (see message-field-extraction.ts's
    // findService fix in this same pass for the OTHER half of this
    // scenario). But the model's own prose confidently — and wrongly —
    // narrated "I'm switching that to a routine cleaning instead" and
    // then composed its OWN confirmation summary saying "routine
    // cleaning," even though the system prompt's own "Current booking
    // state" line told it the truth. The customer said "yes" to a
    // cleaning; the app booked a filling — a real, serious mismatch
    // between what's shown and what's confirmed, the exact failure
    // mode Objective 2 exists to prevent. Fix: this specific reply is
    // NEVER the model's own text — always the application's own
    // composeConfirmationPrompt, guaranteed to match bookingState
    // exactly, the same way DevRuleBasedAIProvider's
    // presentBookingConfirmation always has (it has no model text to
    // second-guess in the first place).
    // Section 6/8 extension: when the newly-complete intent is
    // book_recurring_appointment, presenting a confirmation ISN'T just a
    // matter of summarizing bookingState — every occurrence must be
    // checked first (never silently skip a conflicting one). Three
    // outcomes: no checkAvailability at all (already handled by the
    // early escalation near the top of this method — unreachable here
    // in practice, since recurrenceIntervalMonths being known would
    // already have escalated before ever reaching this point); every
    // occurrence checks out (a real confirmation, pendingAction stays
    // "confirm_service"); or a genuine conflict (an explanation instead
    // of a confirmation, and pendingAction is walked back — nothing is
    // actually ready to confirm yet, even though applyPendingAction
    // above already (correctly, from field-completeness alone) set it).
    let freshConfirmationReply: string | undefined;
    if (
      !escalationSafetyReply &&
      !declineOverrideReply &&
      !duplicateBookingReply &&
      !confirmationRequiredReply &&
      !hoursRejectionReply &&
      !availabilityRejectionReply &&
      !phoneRejectionReply &&
      !timeRejectionReply &&
      bookingState.pendingAction === "confirm_service" &&
      request.bookingState.pendingAction !== "confirm_service" &&
      !actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type))
    ) {
      if (bookingState.intent === "book_recurring_appointment" && request.checkAvailability) {
        const recurring = composeRecurringConfirmationOrConflict(
          request.business,
          bookingState,
          request.checkAvailability,
        );
        freshConfirmationReply = recurring.reply;
        if (!recurring.ready) {
          const { pendingAction: _pendingAction, ...rest } = bookingState;
          bookingState = rest;
        }
      } else if (bookingState.intent !== "book_recurring_appointment") {
        // Genuine defect found live: presenting a confirmation here never
        // validated business hours at all — only the LATER moment a
        // completing action is actually proposed does (the tool-call
        // loop's checkActionHours). A customer could see "I have you
        // down for Root canal at 4:00 PM" (which actually ends at 5:30
        // PM, past closing) as if it were a real, ready-to-confirm
        // booking, only to be rejected on "yes" — never a false BOOKING
        // claim (nothing was ever actually booked), but a misleading,
        // wasted round-trip. Fixed the same way the recurring case
        // above already works: check FIRST, and if invalid, explain why
        // instead of presenting a confirmation at all. Availability
        // (not just hours) is deliberately NOT also checked here — that
        // stays the documented, accepted limitation described in
        // AIProviderRequest.checkAvailability's own docstring (no
        // alternative-time-finding is exposed through that hook), while
        // hours are fully derivable from BusinessContext alone with no
        // simulator needed at all.
        const hoursValidation = validateHoursForIntent(
          request.business,
          bookingState.intent,
          bookingState.date!,
          bookingState.time!,
          bookingState.service,
        );
        if (!hoursValidation.valid) {
          // Genuine gap found live (context-state regression, reschedule
          // flow): "did you mean 2 PM instead?" previously existed only
          // in the model's own prose, backed by no application state —
          // a customer's "yes" had nothing deterministic to confirm. Only
          // proposed for "outside_hours" (a single AM/PM flip can never
          // fix "closed_day" — that's a wrong DAY, not a wrong hour), and
          // only when the flipped candidate itself actually validates —
          // never proposed on faith.
          const flipped = flipMeridiemHour(bookingState.time!);
          const flippedValidation =
            hoursValidation.reason === "outside_hours"
              ? validateHoursForIntent(request.business, bookingState.intent, bookingState.date!, flipped, bookingState.service)
              : undefined;
          if (flippedValidation?.valid) {
            freshConfirmationReply = `Did you mean ${formatTime12h(flipped)} instead?`;
            const { pendingAction: _pendingAction, ...rest } = bookingState;
            bookingState = { ...rest, pendingCorrection: flipped };
          } else {
            freshConfirmationReply = describeInvalidTime(
              request.business,
              hoursValidation,
              bookingState.date!,
              bookingState.time!,
            );
            const { pendingAction: _pendingAction, date: _date, time: _time, ...rest } = bookingState;
            bookingState = rest;
          }
        } else {
          freshConfirmationReply = composeConfirmationPrompt(request.business, bookingState);
        }
      }
    }

    // An unresolved time clarification outranks every confirmation prompt and all model text: never invite a "yes"
    // while the stored time is in doubt. (Escalation to a human still comes first.)
    const timeClarificationReply = bookingState.timeClarification ? TIME_CLARIFICATION_REPLY : undefined;
    // App-controlled confirmation prompts: model text may only invite a confirmation when it IS the app's own prompt for the
    // stored values. Every app-composed reply is already earlier in the chain below, so anything reaching here is model prose.
    //   - armed (pendingAction set) -> the app's summary of the STORED values replaces the model's wording;
    //   - not armed                 -> the app's own next question replaces it (the customer is never invited to say "yes"
    //                                  to something the app has not armed). Recurring bookings keep their own
    //                                  availability-aware prompt flow and are left untouched.
    let modelText = claimsCompletionWithoutAction ? null : result.content;
    if (
      modelText !== null &&
      !actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type)) &&
      bookingState.intent !== "book_recurring_appointment" &&
      looksLikeConfirmationPrompt(modelText)
    ) {
      modelText =
        bookingState.pendingAction === "confirm_service"
          ? composeConfirmationPrompt(request.business, bookingState)
          : fallbackReplyForEmptyContent(request.business, bookingState, actions);
    }

    const reply: string | null =
      escalationSafetyReply ??
      timeClarificationReply ??
      declineOverrideReply ??
      duplicateBookingReply ??
      confirmationRequiredReply ??
      hoursRejectionReply ??
      availabilityRejectionReply ??
      phoneRejectionReply ??
      timeRejectionReply ??
      freshConfirmationReply ??
      modelText ??
      // The model made a tool call but returned no text at all (observed
      // live with openai/gpt-4o-mini via OpenRouter — it sometimes calls
      // update_booking_progress/escalate without pairing it with a
      // sentence), or its text claimed a completion that didn't actually
      // happen (see claimsCompletionWithoutAction above). A blank or
      // untrustworthy reply is never acceptable, so the application
      // composes one deterministically rather than leaving the customer
      // with nothing (or something false): mirrors what actually happened
      // this turn — a completed booking, a hand-off, or (most commonly)
      // whatever field is still needed next.
      fallbackReplyForEmptyContent(request.business, bookingState, actions);

    // True exactly when `reply` is fallbackReplyForEmptyContent's generic
    // completing-action filler — i.e. every named reply above was absent
    // AND a completing action is being proposed this turn. Recomputed
    // from the same conditions (not string-matched against `reply`) so it
    // can never misfire on a model reply that happens to say something
    // similar. See AIProviderResponse.completingActionReplyIsGeneric.
    const completingActionReplyIsGeneric =
      !escalationSafetyReply &&
      !declineOverrideReply &&
      !duplicateBookingReply &&
      !confirmationRequiredReply &&
      !hoursRejectionReply &&
      !availabilityRejectionReply &&
      !phoneRejectionReply &&
      !timeRejectionReply &&
      (claimsCompletionWithoutAction || result.content === null) &&
      actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type));

    // Objective 4: track/act on genuinely-unclear turns. Precisely the
    // condition under which fallbackReplyForEmptyContent's own final,
    // no-active-intent branch fired — recomputed explicitly here (not
    // string-matched against `reply`) so it can never accidentally
    // trigger on a model reply that just happens to say the same words.
    const isGenuinelyUnclear =
      result.content === null &&
      !escalationSafetyReply &&
      !declineOverrideReply &&
      !duplicateBookingReply &&
      !confirmationRequiredReply &&
      !hoursRejectionReply &&
      !availabilityRejectionReply &&
      !phoneRejectionReply &&
      !timeRejectionReply &&
      !claimsCompletionWithoutAction &&
      !actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type)) &&
      !actions.some((a) => a.type === "escalate") &&
      !bookingState.intent;

    // Only actually attached if nothing else this turn already explains
    // it — a completing action or an escalate means the model plainly
    // did understand something, even though deterministic extraction
    // itself found nothing (e.g. it resolved things from context/prose
    // the deterministic layer never sees).
    const unclearPhraseObservation =
      unclearPhraseCandidate &&
      !knowledgeConsulted &&
      !actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type)) &&
      !actions.some((a) => a.type === "escalate")
        ? unclearPhraseCandidate
        : undefined;

    if (!isGenuinelyUnclear) {
      // Something WAS understood (or there's nothing to misunderstand,
      // e.g. a plain FAQ answer) — the counter never persists past a
      // turn that actually made progress.
      if (bookingState.unclearTurnCount) {
        const { unclearTurnCount: _unclearTurnCount, ...rest } = bookingState;
        return { reply, actions, bookingState: rest, completingActionReplyIsGeneric, unclearPhraseObservation };
      }
      return { reply, actions, bookingState, completingActionReplyIsGeneric, unclearPhraseObservation };
    }

    const consecutiveUnclear = (request.bookingState.unclearTurnCount ?? 0) + 1;
    if (consecutiveUnclear < UNCLEAR_TURN_ESCALATION_THRESHOLD) {
      return { reply, actions, bookingState: { ...bookingState, unclearTurnCount: consecutiveUnclear } };
    }

    // Genuinely not understood, twice in a row — Objective 4: "the
    // receptionist must be comfortable admitting uncertainty," not loop
    // the same clarification question forever. This can only ever lead
    // to escalation, never to booking anything — the hard confirmation
    // gate (booking-confirmation.ts) is completely independent of this
    // counter.
    const { unclearTurnCount: _unclearTurnCount, ...clearedState } = bookingState;
    return {
      reply: "I want to make sure you get the right help — let me connect you with a member of our team.",
      actions: [
        ...actions,
        {
          type: "escalate",
          payload: {
            reason: "customer's messages could not be understood after repeated attempts",
            unresolvedQuestion: request.message,
          },
        },
      ],
      bookingState: clearedState,
    };
  }
}

/** Only reached when the model's response had zero text (see above) —
 * every other case already has a real reply from the model or one of the
 * rejection paths. Priority mirrors what the customer needs to hear most:
 * a completed action first, then a hand-off, then whatever's still
 * missing to keep the flow moving. Doesn't need to special-case setting
 * pendingAction anymore — applyPendingAction already computed the correct
 * state before this ever runs. */
function fallbackReplyForEmptyContent(
  business: BusinessContext,
  bookingState: BookingState,
  actions: ReceptionistAction[],
): string {
  if (actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type))) {
    return "I've captured your request — a team member will confirm.";
  }
  if (actions.some((a) => a.type === "escalate")) {
    return business.escalationHandoffMessage;
  }
  switch (nextRequiredField(bookingState)) {
    case "service":
      return "Which service would you like to book?";
    case "date":
      return bookingState.time
        ? "What day works for you?"
        : "What day and time works best for you?";
    case "time":
      return "What time works for you?";
    case "name":
      return "Could I get your name?";
    case "phone":
      return "And the best phone number to reach you?";
    default:
      // nextRequiredField returns undefined for two different reasons —
      // either there's no active intent at all (nothing to confirm, so a
      // generic nudge is the best we can do), or every required field IS
      // known but the model stalled without calling the completing action
      // (observed live: the model repeats this indefinitely otherwise,
      // since the customer has nothing new to say — a vague "could you
      // say that again?" can't break that loop, but an explicit yes/no
      // confirmation prompt gives them something concrete to respond to).
      return bookingState.intent ? composeConfirmationPrompt(business, bookingState) : GENUINELY_UNCLEAR_REPLY;
  }
}

/** Application-owned state, step 2 (see generateResponse) — computed
 * fresh every turn, never trusted from the model. A no-op when nothing
 * changes (including the all-fields-cleared {} case after a completing
 * action, where computePendingAction correctly returns undefined too). */
function applyPendingAction(bookingState: BookingState): BookingState {
  const computed = computePendingAction(bookingState);
  if (computed === bookingState.pendingAction) return bookingState;
  if (computed) return { ...bookingState, pendingAction: computed };
  const { pendingAction: _pendingAction, ...rest } = bookingState;
  return rest;
}

function checkActionHours(
  business: BusinessContext,
  action: ReceptionistAction,
): { validation: BusinessHoursValidation; date: string; time: string } | undefined {
  if (action.type === "request_appointment") {
    const service = business.services.find((s) => s.name === action.payload.service);
    const validation = validateAppointmentTime(
      business,
      action.payload.preferredDate,
      action.payload.preferredTime,
      service?.durationMinutes ?? 0,
    );
    return { validation, date: action.payload.preferredDate, time: action.payload.preferredTime };
  }
  if (action.type === "request_reschedule") {
    const validation = isWithinOperatingWindow(
      business,
      action.payload.newPreferredDate,
      action.payload.newPreferredTime,
    );
    return {
      validation,
      date: action.payload.newPreferredDate,
      time: action.payload.newPreferredTime,
    };
  }
  return undefined;
}

/** Availability is only meaningful for a NEW booking — a reschedule or
 * cancellation has no "slot" of its own checked here, matching the same
 * scope decision made for DevRuleBasedAIProvider (see dev-rule-based-
 * provider.ts's finishFlowTurn). Only called once hours validation has
 * already passed for this action. */
function checkActionAvailability(
  business: BusinessContext,
  action: ReceptionistAction,
): { available: boolean; date: string; time: string; alternatives: string[] } | undefined {
  if (action.type !== "request_appointment") return undefined;

  const { preferredDate: date, preferredTime: time, service: serviceName } = action.payload;
  if (isSlotAvailable(business, date, time)) {
    return { available: true, date, time, alternatives: [] };
  }
  const duration = business.services.find((s) => s.name === serviceName)?.durationMinutes ?? 0;
  return {
    available: false,
    date,
    time,
    alternatives: findAlternativeTimes(business, date, time, duration),
  };
}

/** Normalizes an action's `phone` field via the same extractPhone logic
 * DevRuleBasedAIProvider uses, so a phone reported through the LLM path
 * ends up in the identical canonical form (e.g. "+12428012847") rather
 * than whatever raw digits the model happened to echo back. Actions
 * without a phone field at all (escalate) pass through untouched.
 * create_lead's phone is optional — an unnormalizable one is dropped, not
 * rejected, since a lead is a soft record, not a real business action. */
function normalizeActionPhone(
  business: BusinessContext,
  action: ReceptionistAction,
): { rejected: false; action: ReceptionistAction } | { rejected: true } {
  switch (action.type) {
    case "create_lead": {
      if (!action.payload.phone) return { rejected: false, action };
      const normalized = extractPhone(action.payload.phone, business.areaCode);
      return {
        rejected: false,
        action: { ...action, payload: { ...action.payload, phone: normalized } },
      };
    }
    case "request_appointment": {
      const normalized = extractPhone(action.payload.phone, business.areaCode);
      if (!normalized) return { rejected: true };
      return {
        rejected: false,
        action: { ...action, payload: { ...action.payload, phone: normalized } },
      };
    }
    case "request_reschedule": {
      const normalized = extractPhone(action.payload.phone, business.areaCode);
      if (!normalized) return { rejected: true };
      return {
        rejected: false,
        action: { ...action, payload: { ...action.payload, phone: normalized } },
      };
    }
    case "request_cancellation": {
      const normalized = extractPhone(action.payload.phone, business.areaCode);
      if (!normalized) return { rejected: true };
      return {
        rejected: false,
        action: { ...action, payload: { ...action.payload, phone: normalized } },
      };
    }
    default:
      return { rejected: false, action };
  }
}

/** Normalizes an action's time field(s) via normalizeTime (date-time.ts)
 * before hours/availability validation ever sees them — same shape as
 * normalizeActionPhone above, for the same reason: never trust the
 * model's exact formatting verbatim. Only request_appointment/
 * request_reschedule carry a time field; every other action type passes
 * through untouched. */
function normalizeActionTime(
  action: ReceptionistAction,
): { rejected: false; action: ReceptionistAction } | { rejected: true } {
  switch (action.type) {
    case "request_appointment": {
      const normalized = normalizeTime(action.payload.preferredTime);
      if (!normalized) return { rejected: true };
      return {
        rejected: false,
        action: { ...action, payload: { ...action.payload, preferredTime: normalized } },
      };
    }
    case "request_reschedule": {
      const normalized = normalizeTime(action.payload.newPreferredTime);
      if (!normalized) return { rejected: true };
      return {
        rejected: false,
        action: { ...action, payload: { ...action.payload, newPreferredTime: normalized } },
      };
    }
    default:
      return { rejected: false, action };
  }
}

/** A completing action (appointment/reschedule/cancellation actually
 * requested) always clears the slate (except bookingJustCompleted — see
 * below). Otherwise, `previous` (already updated with this turn's
 * deterministic field extraction — see generateResponse, which now
 * includes FIRST-detection intent too; see message-field-extraction.ts's
 * detectStatedIntent) only ever gains `intent` from the model here.
 * Reported intent normally always wins when present — this is what lets
 * a customer switch flows mid-conversation ("actually let's cancel
 * instead") even after intent is already set, which is the one case
 * deterministic detection deliberately doesn't attempt (see
 * detectStatedIntent's docstring) — any now-irrelevant leftover fields
 * from the old intent (e.g. service/date/time under a switched-to
 * cancellation) are simply never read, since nextRequiredField only looks
 * at fields relevant to the CURRENT intent. pendingAction is handled
 * separately by applyPendingAction.
 *
 * The ONE exception: while bookingJustCompleted is still armed,
 * reportedIntent is IGNORED entirely, not merged in at all — only THIS
 * turn's deterministic extraction (already reflected in `previous.intent`
 * before this function ever runs) can disarm it. See the duplicate-
 * booking guard above for why: a model can call
 * update_booking_progress(book_appointment) in the very same response as
 * a hallucinated repeat request_appointment call, "reporting intent" out
 * of habit rather than genuine new customer intent. If reportedIntent
 * were trusted here, a blocked hallucination would still silently disarm
 * the guard for the NEXT turn, letting a second attempt through. */
function deriveBookingState(
  previous: BookingState,
  reportedIntent: BookingIntent | undefined,
  actions: ReceptionistAction[],
): BookingState {
  const completingAction = actions.find((a) => COMPLETING_ACTION_TYPES.has(a.type));
  if (completingAction) {
    // Deliberately NOT a full {} reset — bookingJustCompleted survives so
    // a later hallucinated repeat action can be recognized and blocked
    // (see the duplicate-booking guard above) without depending on the
    // model remembering it already did this. lastCompletedBooking is
    // captured from the ACTION'S OWN payload (what was actually
    // submitted), not from `previous`, so a correction on the very next
    // turn ("actually, Wednesday instead") has real name/phone/date/time
    // to work with — see message-field-extraction.ts's
    // detectPostCompletionReschedule.
    return { bookingJustCompleted: true, lastCompletedBooking: snapshotFromCompletedAction(completingAction) };
  }

  if (previous.bookingJustCompleted) {
    if (previous.intent) {
      // THIS turn's own deterministic extraction established a fresh
      // intent — genuine evidence (from the customer's own message, not
      // the model) that they've moved on to something new.
      const { bookingJustCompleted: _flag, lastCompletedBooking: _snapshot, ...rest } = previous;
      return rest;
    }
    return previous; // still armed — reportedIntent ignored entirely
  }

  if (reportedIntent) {
    return { ...previous, intent: reportedIntent };
  }
  return previous;
}

/** Builds the lastCompletedBooking snapshot from whichever completing
 * action just succeeded — each action type carries a different payload
 * shape (only request_appointment has `service`; the field names for
 * date/time differ between request_appointment and request_reschedule),
 * so this normalizes them into one common shape. */
function snapshotFromCompletedAction(action: ReceptionistAction): CompletedBookingSnapshot {
  switch (action.type) {
    case "request_appointment":
      return {
        intent: "book_appointment",
        service: action.payload.service,
        date: action.payload.preferredDate,
        time: action.payload.preferredTime,
        name: action.payload.name,
        phone: action.payload.phone,
      };
    case "request_reschedule":
      return {
        intent: "reschedule_appointment",
        date: action.payload.newPreferredDate,
        time: action.payload.newPreferredTime,
        name: action.payload.name,
        phone: action.payload.phone,
      };
    case "request_cancellation":
      return { intent: "cancel_appointment", name: action.payload.name, phone: action.payload.phone };
    case "request_recurring_appointment":
      // Genuine bug found while testing: this switch didn't have a case
      // for the new action type at all, even though it was already
      // added to COMPLETING_ACTION_TYPES — threw on every successful
      // recurring booking. `date`/`time` snapshot the SERIES START
      // (the one thing a post-completion correction could plausibly
      // mean here); detectPostCompletionReschedule doesn't specially
      // handle "correct my recurring series" (which occurrence would
      // even mean) — a documented, accepted limitation, not addressed
      // this pass.
      return {
        intent: "book_recurring_appointment",
        service: action.payload.service,
        date: action.payload.startDate,
        time: action.payload.startTime,
        name: action.payload.name,
        phone: action.payload.phone,
      };
    default:
      // COMPLETING_ACTION_TYPES only ever contains the cases above.
      throw new Error(`Unexpected completing action type: ${action.type}`);
  }
}

function buildSystemPrompt(request: AIProviderRequest): string {
  const { business, customer, bookingState, handoffActive } = request;
  const services = business.services
    .map((s) => `- ${s.name}: ${s.priceLabel}, about ${s.durationMinutes} minutes`)
    .join("\n");
  const known =
    [
      customer.name ? `name: ${customer.name}` : null,
      customer.phone ? `phone: ${customer.phone}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "none yet";

  const bookingKnown =
    [
      bookingState.intent ? `intent: ${bookingState.intent}` : null,
      bookingState.service ? `service: ${bookingState.service}` : null,
      bookingState.date ? `date: ${bookingState.date}` : null,
      bookingState.time ? `time: ${bookingState.time}` : null,
      bookingState.name ? `name: ${bookingState.name}` : null,
      bookingState.phone ? `phone: ${bookingState.phone}` : null,
      bookingState.pendingAction ? `pendingAction: ${bookingState.pendingAction}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "nothing yet — no booking in progress";

  const weeklyHours = (
    Object.entries(business.weeklyHours) as [string, { open: string; close: string } | null][]
  )
    .map(([day, hours]) => `${day}: ${hours ? `${hours.open}–${hours.close}` : "closed"}`)
    .join(", ");

  return [
    `You are the virtual receptionist for ${business.name}, a dental practice.`,
    `Hours: ${business.hours}. Address: ${business.address}. Timezone: ${business.timezone}.`,
    `Structured weekly hours (24-hour, for your reference only — the application independently validates every requested time against this and will reject anything outside it, so always check before proposing a time): ${weeklyHours}`,
    `Services:\n${services}`,
    `Insurance: ${business.policies.insurance}`,
    `New patients: ${business.policies.newPatientInfo}`,
    `Cancellation policy: appointments can be cancelled up to ${business.policies.cancellationCutoffHours} hours before the scheduled time.`,
    `Emergency policy: ${business.policies.emergencyPolicy}`,
    `Known customer info so far: ${known}`,
    `Current booking state (already confirmed — this is the source of truth, not your memory of the conversation; never ask again for anything listed here): ${bookingKnown}`,
    `Next required field: ${describeNextField(bookingState)}.`,
    `Handoff state: ${handoffActive ? "this conversation has already been escalated to a team member — do not attempt to book, reschedule, or cancel anything; just be polite and let them know a team member will follow up." : "not escalated — automated booking is active."}`,
    "",
    "Rules:",
    "- Be conversational, concise, and ask one question at a time. Never re-ask for information already listed in the current booking state above.",
    '- The application, not you, decides field order: your next question must be about the "Next required field" above — never jump ahead to name or phone while service/date/time are still missing. Answering a side question (FAQ) or acknowledging a correction/frustration first is fine; just return to asking about the next required field afterward, not something further along.',
    "- The application tracks service/date/time/name/phone directly from what the customer types — you don't need to (and shouldn't try to) report those yourself. Call update_booking_progress with just the intent as soon as you know whether the customer wants a new booking, a reschedule, or a cancellation; you don't need to call it again after that unless the intent itself changes.",
    '- Never claim a real appointment is booked, rescheduled, or cancelled — you are only ever requesting it; a staff member confirms it. Phrase it conditionally, e.g. "I\'ve captured your request... a team member will confirm."',
    "- Never invent services, prices, or policies not listed above.",
    "- Never claim a real staff member has already been contacted — only that you've flagged/escalated the request.",
    "- Call request_appointment / request_reschedule / request_cancellation only once every required field for that action is known. Never claim to have taken an action without calling the matching tool.",
    "- If a time is ambiguous (e.g. the customer just says a bare number with no am/pm), ask specifically for clarification — do not guess am/pm.",
    '- If what the customer means is genuinely unclear — a garbled message, slang or phrasing you\'re not confident about, or a message that could plausibly mean more than one thing — do not guess and proceed. Say what you think they meant and ask them to confirm or correct it, e.g. "I want to make sure I understood you — are you looking to book a cleaning for Tuesday at 3 PM? Reply YES if that\'s correct, or tell me what you\'d like to change." Never silently pick an interpretation and act on it.',
    "- Never call request_appointment or request_reschedule for a day the business is closed, or a time outside the structured weekly hours above (an appointment must fully fit before closing, not merely start before it). If the customer asks for such a time, tell them it's outside business hours and ask for a different day/time instead.",
    "- Never tell the customer a specific date/time is available — you don't have real-time visibility into what's already booked. The application checks this independently every time you call request_appointment; if the slot turns out to be taken, your reply this turn is replaced with the real answer and real alternative times, so don't pre-empt that by claiming availability yourself.",
    "- If the customer describes a possible emergency, asks for a human, or asks something you can't confidently answer from the information above, call the escalate tool.",
    '- If the booking state above shows a pendingAction, the customer was already asked to confirm going ahead with everything listed — decide what a short reply like "yes" or "no" means using that, not by rereading the conversation. You don\'t need to report pendingAction yourself; the application manages it.',
  ].join("\n");
}

function parseBookingProgress(toolCall: LlmToolCall): { intent: BookingIntent } | undefined {
  let args: unknown;
  try {
    args = JSON.parse(toolCall.argumentsJson);
  } catch {
    return undefined;
  }
  const parsed = updateBookingProgressSchema.safeParse(args);
  return parsed.success ? parsed.data : undefined;
}

function parseToolCall(toolCall: LlmToolCall): ReceptionistAction | undefined {
  let args: unknown;
  try {
    args = JSON.parse(toolCall.argumentsJson);
  } catch {
    return undefined;
  }

  switch (toolCall.name) {
    case "create_lead": {
      const parsed = createLeadSchema.safeParse(args);
      return parsed.success ? { type: "create_lead", payload: parsed.data } : undefined;
    }
    case "request_appointment": {
      const parsed = requestAppointmentSchema.safeParse(args);
      return parsed.success ? { type: "request_appointment", payload: parsed.data } : undefined;
    }
    case "request_reschedule": {
      const parsed = requestRescheduleSchema.safeParse(args);
      return parsed.success ? { type: "request_reschedule", payload: parsed.data } : undefined;
    }
    case "request_cancellation": {
      const parsed = requestCancellationSchema.safeParse(args);
      return parsed.success ? { type: "request_cancellation", payload: parsed.data } : undefined;
    }
    case "request_recurring_appointment": {
      // Only ever reached for the synthetic call
      // buildRecurringAutoConfirmToolCall constructs — never exposed to
      // the model (see RECEPTIONIST_TOOL_DEFINITIONS), so this case
      // exists purely to let that synthetic call round-trip through the
      // same parse/validate pipeline as every other action.
      const parsed = requestRecurringAppointmentSchema.safeParse(args);
      return parsed.success ? { type: "request_recurring_appointment", payload: parsed.data } : undefined;
    }
    case "escalate": {
      const parsed = escalateSchema.safeParse(args);
      return parsed.success ? { type: "escalate", payload: parsed.data } : undefined;
    }
    default:
      return undefined;
  }
}
