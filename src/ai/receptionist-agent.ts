import { formatTime12h } from "./business-hours";
import { isIsoDateString, weekdayForIsoDate } from "./date-time";
import {
  noopLanguageObservationRecorder,
  type LanguageObservationRecorder,
} from "./language-observation-recorder";
import type { KnowledgeService } from "../knowledge/knowledge-service";
import type {
  AIProvider,
  AIProviderRequest,
  ExecutedAction,
  ReceptionistAction,
  ReceptionistAgentResult,
  ReceptionistTools,
  ToolResult,
} from "./types";

const SAFE_FALLBACK_REPLY =
  "Sorry — I wasn't able to complete that. I've flagged this for the team to follow up with you directly.";

const HANDOFF_ACTIVE_REPLY =
  "Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.";

/** Customer-facing message for a real booking-race loss / calendar
 * conflict — see ToolResult.recoverable's docstring for exactly when
 * this fires. Never "You're booked!" for the losing request, and never
 * invented by a model — this is the one accurate, deterministic thing
 * to say, per the Phase 1 concurrency task's (and, later, the clinic
 * simulator's) explicit requirement: "Do NOT claim it was booked.
 * Instead provide alternative availability." Prefers `alternativeSlots`
 * (real date+time pairs, possibly spanning multiple days — what the
 * clinic simulator's findNextAvailable produces) over the older,
 * same-day-only `alternativeTimes` when both are present. */
function composeSlotConflictReply(recoverable: NonNullable<ToolResult["recoverable"]>): string {
  if (recoverable.alternativeSlots && recoverable.alternativeSlots.length > 0) {
    const options = recoverable.alternativeSlots
      .map((slot) => `${formatSlotDate(slot.date)} at ${formatTime12h(slot.time)}`)
      .join(", ");
    return `That appointment was already taken. I can check the next available times for you — we do have ${options} available. Would one of those work?`;
  }
  if (recoverable.alternativeTimes.length === 0) {
    return "That time was just taken while I was booking it, and we don't have any other openings that day. What other day or time would you like to try?";
  }
  const options = recoverable.alternativeTimes.map((t) => formatTime12h(t)).join(", ");
  return `That time was just taken while I was booking it. Let me check the next available times for you — we do have ${options} available that day. Would one of those work?`;
}

/** "2026-09-15" -> "Tuesday, September 15"; a weekday name passes
 * through unchanged. Mirrors business-hours.ts's own displayDate (kept
 * as a small, separate local copy rather than importing across module
 * boundaries for one formatting helper). */
function formatSlotDate(date: string): string {
  if (!isIsoDateString(date)) return date;
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
  return `${weekdayForIsoDate(date)}, ${monthLabel} ${day}`;
}

/**
 * Orchestrates one turn: ask the AIProvider what to say and do, execute
 * whatever it proposes via ReceptionistTools, then decide what the
 * customer actually hears.
 *
 * This is the ONE place the safety requirement is enforced: the
 * provider's `reply` is only ever sent to the customer as-is if every
 * action it requested actually succeeded. If the provider fails, returns
 * something unusable, or any action fails, the customer gets an honest
 * fallback — never the provider's (possibly optimistic) original text —
 * and the conversation is escalated. This is deliberately not delegated
 * to the provider's own judgment, because a provider (especially an LLM)
 * generates its reply before knowing whether the action will succeed.
 *
 * Booking state follows the same rule: the provider's returned
 * BookingState is only trusted when nothing failed. On any failure this
 * reverts to the state the request came in with — a failed booking
 * attempt must never cost the customer the information they already gave.
 *
 * This is ALSO the one place handoff is enforced. Once a conversation has
 * been escalated (for any reason — an explicit request, an emergency, or
 * a failure), no provider is trusted to independently decide the
 * conversation should keep booking itself: `request.handoffActive`
 * short-circuits every subsequent turn before the provider is even
 * called, and any escalate action that fires THIS turn sets it for every
 * turn after. A provider may read `handoffActive` to shape its own
 * reply, but it is never the enforcement point — see AIProviderRequest.
 */
export class ReceptionistAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly tools: ReceptionistTools,
    // Item 5 — unknown-phrase learning foundation. Optional and
    // no-op by default: every existing caller (dev-chat.ts without
    // DB_BOOKING_ENABLED, the in-memory ConversationManager, almost
    // every test) keeps working unchanged. Purely a side observation —
    // see LanguageObservationRecorder's own docstring for why a
    // recording failure can never affect the conversation itself.
    private readonly languageObservationRecorder: LanguageObservationRecorder = noopLanguageObservationRecorder,
    // Business-knowledge (RAG) engine. Optional and absent by default:
    // every existing caller behaves exactly as before. When present, the
    // agent binds a TENANT-SCOPED lookup onto each request — providers
    // can use it but cannot choose the tenant. The engine supplies
    // business FACTS only; availability, booking and every other piece of
    // application state remain deterministic (see KNOWLEDGE_ENGINE.md).
    private readonly knowledge?: KnowledgeService,
  ) {}

  async handleMessage(request: AIProviderRequest): Promise<ReceptionistAgentResult> {
    if (request.handoffActive) {
      // Already escalated — never let a provider (buggy, prompt-injected,
      // or just badly timed) execute a booking/reschedule/cancellation
      // while staff already have this conversation. No provider call is
      // even made.
      return {
        reply: HANDOFF_ACTIVE_REPLY,
        actionsTaken: [],
        safetyOverride: false,
        bookingState: {},
        handoffActive: true,
      };
    }

    const providerRequest = this.knowledge
      ? {
          ...request,
          knowledge: this.knowledge.lookupFor({
            tenantId: request.tenantId,
            business: request.business,
            conversationId: request.conversationId,
          }),
        }
      : request;

    let providerResponse;
    try {
      providerResponse = await this.provider.generateResponse(providerRequest);
    } catch (error) {
      console.error("AIProvider failed:", error);
      return this.safeFallback("the AI provider failed or returned an unusable response", request);
    }

    if (providerResponse.unclearPhraseObservation) {
      const observation = providerResponse.unclearPhraseObservation;
      try {
        await this.languageObservationRecorder.record({
          ...observation,
          conversationId: request.conversationId,
        });
      } catch (error) {
        // Never lets a recording failure affect the conversation itself
        // — see LanguageObservationRecorder's docstring.
        console.error("languageObservationRecorder.record failed:", error);
      }
    }

    if (providerResponse.knowledgeGap && this.knowledge) {
      // A refusal to answer a business question: tell the operator. Never
      // affects this turn, and a recording failure can't either (recordGap
      // swallows its own errors).
      await this.knowledge.recordGap({
        tenantId: request.tenantId,
        conversationId: request.conversationId,
        message: request.message,
        reason: providerResponse.knowledgeGap.reason,
      });
    }

    const actionsTaken: ExecutedAction[] = [];
    let anyFailed = false;
    let escalated = false;

    for (const action of providerResponse.actions) {
      const result = await this.executeAction(
        action,
        request.conversationId,
        providerResponse.bookingState,
      );
      actionsTaken.push({ action, result });
      if (!result.success) anyFailed = true;
      if (action.type === "escalate" && result.success) escalated = true;
    }

    if (anyFailed) {
      // A real database booking-race loss is a NORMAL, recoverable
      // outcome, not a hard failure — see ToolResult.recoverable and
      // PHASE1_PROGRESS.md's design note. Deliberately narrow: only
      // takes this branch when EVERY failed action this turn is exactly
      // this recoverable case — a single slot-conflict alongside any
      // OTHER real failure still falls through to the existing hard-
      // escalate path below, unchanged.
      const failed = actionsTaken.filter((executed) => !executed.result.success);
      const conflict = failed.find(
        (executed) => executed.result.recoverable?.reason === "slot_conflict",
      );
      if (
        conflict &&
        failed.every((executed) => executed.result.recoverable?.reason === "slot_conflict")
      ) {
        // Preserve everything the customer already told the app (never
        // revert to request.bookingState, which would lose a correction
        // made THIS turn) except `time`/`pendingAction` — the customer
        // needs to pick a different time, exactly the same shape as the
        // existing in-memory availability-rejection recovery in
        // llm-provider.ts. Also strip `bookingJustCompleted`/
        // `lastCompletedBooking`: LLMProvider's deriveBookingState arms
        // both optimistically, from the action the model PROPOSED, before
        // this file ever learns whether execution actually succeeded (see
        // deriveBookingState's docstring — it runs inside
        // provider.generateResponse, strictly before the executeAction
        // loop above). Left armed here, a false "booking complete" flag
        // survives into the next turn even though this exact branch exists
        // because the booking failed — found live: an "actually, Wednesday
        // instead" reply after this exact conflict message wrongly
        // triggered detectPostCompletionReschedule's post-completion-
        // correction path (message-field-extraction.ts) and tried to
        // reschedule a booking that was never created, instead of picking
        // one of the alternative times this message just offered.
        const {
          time: _time,
          pendingAction: _pendingAction,
          bookingJustCompleted: _bookingJustCompleted,
          lastCompletedBooking: _lastCompletedBooking,
          ...preserved
        } = providerResponse.bookingState;
        return {
          reply: composeSlotConflictReply(
            conflict.result.recoverable ?? { reason: "slot_conflict", alternativeTimes: [] },
          ),
          actionsTaken,
          safetyOverride: true,
          bookingState: preserved,
          handoffActive: false,
        };
      }

      if (!actionsTaken.some((executed) => executed.action.type === "escalate")) {
        const escalateAction: ReceptionistAction = {
          type: "escalate",
          payload: { reason: "an automated action failed and needs staff follow-up" },
        };
        const result = await this.executeAction(
          escalateAction,
          request.conversationId,
          providerResponse.bookingState,
        );
        actionsTaken.push({ action: escalateAction, result });
        if (result.success) escalated = true;
      }
      return {
        reply: SAFE_FALLBACK_REPLY,
        actionsTaken,
        safetyOverride: true,
        // Once escalated, there's no automated flow left to resume —
        // staff have the full conversation history to work from, and the
        // handoff check above means bookingState won't be read again
        // anyway. Preserved as-is only when this failure did NOT result
        // in an escalation (a transient, retryable tool failure).
        bookingState: escalated ? {} : request.bookingState,
        handoffActive: escalated,
      };
    }

    return {
      reply: this.finalReplyFor(
        providerResponse.reply,
        providerResponse.completingActionReplyIsGeneric,
        actionsTaken,
      ),
      actionsTaken,
      safetyOverride: false,
      bookingState: escalated ? {} : providerResponse.bookingState,
      handoffActive: escalated,
    };
  }

  /** The provider composes its completing-action reply BEFORE the action
   * actually runs, so on its generic "team member will confirm" filler it
   * can only ever guess whether ReceptionistTools will report a genuine,
   * durable write (ToolResult.persisted) or just a validated-only no-op
   * (see ToolResult.persisted's docstring) — the two Objective 1 bug
   * report flagged as needing an accurate, execution-aware reply instead.
   * Only swaps in something more concrete when BOTH: the provider itself
   * marked its reply as that generic filler (never touches a model's own
   * generated text), AND execution actually persisted something real.
   * Otherwise the provider's original reply stands unchanged. */
  private finalReplyFor(
    reply: string,
    completingActionReplyIsGeneric: boolean | undefined,
    actionsTaken: ExecutedAction[],
  ): string {
    if (!completingActionReplyIsGeneric) return reply;
    const persisted = actionsTaken.find(
      (executed) =>
        (executed.action.type === "request_appointment" ||
          executed.action.type === "request_reschedule" ||
          executed.action.type === "request_cancellation") &&
        executed.result.persisted === true,
    );
    if (!persisted) return reply;

    switch (persisted.action.type) {
      case "request_appointment": {
        const { service, preferredDate, preferredTime } = persisted.action.payload;
        return `You're on the calendar — ${service} on ${preferredDate} at ${formatTime12h(preferredTime)}. A team member may still follow up with any details.`;
      }
      case "request_reschedule": {
        const { newPreferredDate, newPreferredTime } = persisted.action.payload;
        return `Done — your appointment is now on the calendar for ${newPreferredDate} at ${formatTime12h(newPreferredTime)}. A team member may still follow up with any details.`;
      }
      case "request_cancellation":
        return "Done — that appointment has been cancelled.";
      default:
        return reply;
    }
  }

  private async safeFallback(
    reason: string,
    request: AIProviderRequest,
  ): Promise<ReceptionistAgentResult> {
    const escalateAction: ReceptionistAction = { type: "escalate", payload: { reason } };
    // No providerResponse exists in this path (the provider call itself
    // failed) — the incoming request's own bookingState is the most
    // accurate snapshot available.
    const result = await this.executeAction(
      escalateAction,
      request.conversationId,
      request.bookingState,
    );
    return {
      reply: SAFE_FALLBACK_REPLY,
      actionsTaken: [{ action: escalateAction, result }],
      safetyOverride: true,
      bookingState: {},
      handoffActive: result.success,
    };
  }

  /** Never throws — a tool that throws is treated as a failed result, not
   * a crash, so one broken action can't take down the whole turn.
   *
   * `conversationId`/`bookingStateSnapshot` are stamped onto
   * create_lead/escalate payloads here, never constructed by a provider
   * — see CreateLeadPayload/EscalatePayload's docstrings in types.ts for
   * why this is the one injection point rather than threading it through
   * every provider's own action-construction logic. */
  private async executeAction(
    action: ReceptionistAction,
    conversationId?: string,
    bookingStateSnapshot?: ReceptionistAgentResult["bookingState"],
  ): Promise<ToolResult> {
    try {
      switch (action.type) {
        case "create_lead":
          return await this.tools.createLead(
            conversationId ? { ...action.payload, conversationId } : action.payload,
          );
        case "request_appointment":
          return await this.tools.requestAppointment(action.payload);
        case "request_reschedule":
          return await this.tools.requestReschedule(action.payload);
        case "request_cancellation":
          return await this.tools.requestCancellation(action.payload);
        case "request_recurring_appointment":
          return await this.tools.requestRecurringAppointment(action.payload);
        case "escalate":
          return await this.tools.escalate({
            ...action.payload,
            ...(conversationId ? { conversationId } : {}),
            ...(bookingStateSnapshot ? { bookingStateSnapshot } : {}),
          });
      }
    } catch (error) {
      console.error(`Tool execution threw for action "${action.type}":`, error);
      return { success: false, error: error instanceof Error ? error.message : "unknown error" };
    }
  }
}
