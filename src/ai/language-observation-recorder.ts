import { resolveTenant } from "../db/domain-resolution";
import { recordObservation } from "../db/language-observations";
import type { Db } from "../db/client";
import type { BusinessContext } from "./types";

/**
 * Item 5 — unknown-phrase learning foundation, wired in. The one place
 * both providers' `AIProviderResponse.unclearPhraseObservation` (see its
 * docstring in types.ts) actually gets persisted — ReceptionistAgent
 * calls this after a turn, purely as a side observation for future human
 * review. NEVER read back by anything in this codebase to change live
 * behavior (same explicit constraint Objective 5/6 was built under —
 * see language-observations.ts's own docstring); a failure to record
 * must never break the conversation, so ReceptionistAgent wraps every
 * call in try/catch and swallows errors.
 */
export interface LanguageObservationRecorderInput {
  phrase: string;
  reason: string;
  context: string;
  outcome: string;
  conversationId?: string;
}

export interface LanguageObservationRecorder {
  record(input: LanguageObservationRecorderInput): Promise<void>;
}

/** No-op default — used whenever no real persistence is configured
 * (in-memory ConversationManager, most tests, dev-chat.ts without
 * DB_BOOKING_ENABLED). Recording is purely additive; its total absence
 * changes nothing about booking behavior. */
export const noopLanguageObservationRecorder: LanguageObservationRecorder = {
  async record() {
    // Intentionally empty.
  },
};


/** Real, DB-backed recorder. `normalizedMeaning`/`intent` are stamped
 * with explicit sentinels rather than a guess — this module's whole
 * point is phrases the app did NOT confidently interpret, so there is
 * genuinely nothing to propose here (contrast with a future dialect-
 * mapping source that WOULD have a real proposed meaning/confidence). */
export function createDbLanguageObservationRecorder(
  business: BusinessContext,
  db: Db,
): LanguageObservationRecorder {
  let tenantIdPromise: Promise<string> | undefined;

  return {
    async record(input) {
      tenantIdPromise ??= resolveTenant(db, business);
      const tenantId = await tenantIdPromise;
      await recordObservation(db, {
        tenantId,
        phrase: input.phrase,
        normalizedMeaning: "(no confident interpretation)",
        intent: "unknown",
        reason: input.reason,
        context: input.context,
        outcome: input.outcome,
        sourceConversationId: input.conversationId,
      });
    },
  };
}
