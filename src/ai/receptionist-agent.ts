import type {
  AIProvider,
  AIProviderRequest,
  BookingState,
  ExecutedAction,
  ReceptionistAction,
  ReceptionistAgentResult,
  ReceptionistTools,
  ToolResult,
} from "./types";

const SAFE_FALLBACK_REPLY =
  "Sorry — I wasn't able to complete that. I've flagged this for the team to follow up with you directly.";

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
 */
export class ReceptionistAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly tools: ReceptionistTools,
  ) {}

  async handleMessage(request: AIProviderRequest): Promise<ReceptionistAgentResult> {
    let providerResponse;
    try {
      providerResponse = await this.provider.generateResponse(request);
    } catch (error) {
      console.error("AIProvider failed:", error);
      return this.safeFallback(
        "the AI provider failed or returned an unusable response",
        request.bookingState,
      );
    }

    const actionsTaken: ExecutedAction[] = [];
    let anyFailed = false;

    for (const action of providerResponse.actions) {
      const result = await this.executeAction(action);
      actionsTaken.push({ action, result });
      if (!result.success) anyFailed = true;
    }

    if (anyFailed) {
      if (!actionsTaken.some((executed) => executed.action.type === "escalate")) {
        const escalateAction: ReceptionistAction = {
          type: "escalate",
          payload: { reason: "an automated action failed and needs staff follow-up" },
        };
        actionsTaken.push({
          action: escalateAction,
          result: await this.executeAction(escalateAction),
        });
      }
      // Revert to the pre-turn state — the provider's returned state
      // assumed success, but the customer's already-given info shouldn't
      // be lost just because the booking tool failed.
      return {
        reply: SAFE_FALLBACK_REPLY,
        actionsTaken,
        safetyOverride: true,
        bookingState: request.bookingState,
      };
    }

    return {
      reply: providerResponse.reply,
      actionsTaken,
      safetyOverride: false,
      bookingState: providerResponse.bookingState,
    };
  }

  private async safeFallback(
    reason: string,
    previousBookingState: BookingState,
  ): Promise<ReceptionistAgentResult> {
    const escalateAction: ReceptionistAction = { type: "escalate", payload: { reason } };
    const result = await this.executeAction(escalateAction);
    return {
      reply: SAFE_FALLBACK_REPLY,
      actionsTaken: [{ action: escalateAction, result }],
      safetyOverride: true,
      bookingState: previousBookingState,
    };
  }

  /** Never throws — a tool that throws is treated as a failed result, not
   * a crash, so one broken action can't take down the whole turn. */
  private async executeAction(action: ReceptionistAction): Promise<ToolResult> {
    try {
      switch (action.type) {
        case "create_lead":
          return await this.tools.createLead(action.payload);
        case "request_appointment":
          return await this.tools.requestAppointment(action.payload);
        case "request_reschedule":
          return await this.tools.requestReschedule(action.payload);
        case "request_cancellation":
          return await this.tools.requestCancellation(action.payload);
        case "escalate":
          return await this.tools.escalate(action.payload);
      }
    } catch (error) {
      console.error(`Tool execution threw for action "${action.type}":`, error);
      return { success: false, error: error instanceof Error ? error.message : "unknown error" };
    }
  }
}
