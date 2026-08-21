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

  getBookingState(): BookingState {
    return { ...this.bookingState };
  }

  setBookingState(next: BookingState): void {
    this.bookingState = { ...next };
  }

  buildRequest(params: {
    business: BusinessContext;
    customer: CustomerContext;
    history: ConversationTurn[];
    message: string;
  }): AIProviderRequest {
    return {
      business: params.business,
      customer: params.customer,
      history: params.history.slice(-ConversationManager.MAX_HISTORY_TURNS),
      message: params.message,
      bookingState: this.getBookingState(),
    };
  }
}
