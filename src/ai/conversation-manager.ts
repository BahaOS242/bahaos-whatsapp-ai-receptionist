import type {
  AIProviderRequest,
  BookingState,
  BusinessContext,
  ConversationTurn,
  CustomerContext,
} from "./types";

/**
 * Assembles the request an AIProvider needs, and owns the persisted
 * BookingState across turns — the actual fix for providers "forgetting"
 * information a customer already gave. State is extracted once per turn
 * by the provider and handed back; this class is just where it's kept
 * between calls, so no provider ever has to re-derive it by re-scanning
 * conversation history text.
 *
 * Still has no database/session wiring in this milestone — the caller
 * (today: the dev chat script; later: a real conversation store) owns one
 * instance per conversation and is responsible for supplying history and
 * customer context each time. Swapping in real persistence later means
 * changing only where these values come from, not this class's shape.
 */
export class ConversationManager {
  private static readonly MAX_HISTORY_TURNS = 20;

  private bookingState: BookingState = {};
  private handoffActive = false;

  getBookingState(): BookingState {
    return { ...this.bookingState };
  }

  setBookingState(next: BookingState): void {
    this.bookingState = { ...next };
  }

  getHandoffActive(): boolean {
    return this.handoffActive;
  }

  setHandoffActive(active: boolean): void {
    this.handoffActive = active;
  }

  /** The explicit "human/system resumes automation" mechanism required
   * alongside handoff enforcement — never triggered by anything the
   * customer says in chat, only by whatever calls this (e.g. a future
   * staff dashboard action). */
  resumeAutomation(): void {
    this.handoffActive = false;
  }

  buildRequest(params: {
    business: BusinessContext;
    customer: CustomerContext;
    history: ConversationTurn[];
    message: string;
    /** See AIProviderRequest.checkAvailability's own docstring — passed
     * straight through, undefined for every caller not wiring in the
     * clinic simulator. */
    checkAvailability?: AIProviderRequest["checkAvailability"];
    /** Only for callers that know their tenant (see AIProviderRequest.
     * tenantId) — omitted for the plain in-memory path. */
    tenantId?: string;
  }): AIProviderRequest {
    return {
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      business: params.business,
      customer: params.customer,
      history: params.history.slice(-ConversationManager.MAX_HISTORY_TURNS),
      message: params.message,
      bookingState: this.getBookingState(),
      handoffActive: this.handoffActive,
      checkAvailability: params.checkAvailability,
    };
  }
}
