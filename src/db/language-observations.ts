import { and, desc, eq } from "drizzle-orm";
import { languageObservations } from "./schema";
import type { Db } from "./client";

/**
 * Objectives 5/6 — structured language/dialect observation foundation.
 * NOT self-modifying model training, and NOT wired into any live
 * extraction/intent-matching this phase: recording or even confirming
 * an observation never changes what the deterministic layer recognizes
 * on its own. Only `approveObservation` — an explicit, human-initiated
 * action (no admin UI built yet to trigger it) — is meant to eventually
 * feed back into production behavior, and nothing in this codebase
 * reads `approved` rows for that purpose yet either. See
 * PHASE1_PROGRESS.md for the full design rationale and what's
 * deliberately NOT built this phase.
 *
 * State progression: observed -> customer_confirmed -> repeated ->
 * approved (or -> rejected, from any non-terminal state, for a human
 * reviewer to explicitly decline one).
 */


/** Trim + collapse internal whitespace + lowercase — matches "Put me
 * down fi ", "put me down fi", and "put   me down fi" to the SAME
 * observation rather than fragmenting evidence across near-duplicate
 * rows. Deliberately simple (no stemming/fuzzy matching) — this is
 * about normalizing incidental formatting, not language understanding. */
export function normalizePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface RecordObservationInput {
  tenantId: string;
  /** The observed phrase/snippet itself — never the customer's full
   * message or other conversation content (see this module's own
   * docstring). Normalized via normalizePhrase before matching/storage. */
  phrase: string;
  /** Human-readable meaning proposed for this phrase, e.g. "book
   * appointment" — or, for a phrase the system genuinely could NOT
   * confidently interpret (see recordUnclearPhrase below), a literal
   * "(no confident interpretation)" sentinel rather than a guess. */
  normalizedMeaning: string;
  /** Free text, not a BookingIntent — some observations aren't booking
   * intents at all (e.g. "customer needs assistance"). */
  intent: string;
  /** BCP-47-ish; defaults to "en". */
  language?: string;
  /** The system's own confidence (0-1) in the proposed interpretation,
   * if there is one. */
  confidence?: number;
  /** Why this phrase was flagged for review — e.g. "no recognized
   * intent, service, date, time, phone, or correction pattern
   * matched". Never the customer's full message (see `context`). */
  reason?: string;
  /** A SHORT, STRUCTURED snapshot of what the app already knew at the
   * moment this was flagged (e.g. "intent=book_appointment;
   * pendingAction=none; nextRequiredField=date") — deliberately never
   * raw conversation text, same constraint as `phrase` itself. */
  context?: string;
  /** What happened on the SAME turn this was recorded — e.g.
   * "asked_for_clarification", "escalated". Not updated retroactively
   * if a later turn resolves things — see this table's own docstring
   * in schema.ts. */
  outcome?: string;
  sourceConversationId?: string;
}

export interface LanguageObservationRecord {
  id: string;
  phrase: string;
  normalizedMeaning: string;
  intent: string;
  language: string;
  confidence: number | null;
  reason: string | null;
  context: string | null;
  outcome: string | null;
  observationCount: number;
  confirmationCount: number;
  status: "observed" | "customer_confirmed" | "repeated" | "approved" | "rejected";
}

/**
 * Records one sighting of a phrase. Finds-or-creates by (tenantId,
 * normalized phrase): a NEW phrase is inserted with status "observed",
 * observationCount 1; an EXISTING one has observationCount incremented,
 * and — if it was already "customer_confirmed" from a PRIOR sighting —
 * advances to "repeated" (the mission's own progression: confirmed once,
 * then seen again independently, is stronger evidence than either alone).
 * Never touches `normalizedMeaning`/`intent` on an existing row even if
 * this call's values differ — the FIRST proposed interpretation is what
 * accumulates evidence; a genuinely different meaning for the same
 * phrase is a new, separate thing to observe, not silently overwritten
 * here (out of scope for this phase — see PHASE1_PROGRESS.md).
 */
export async function recordObservation(
  db: Db,
  input: RecordObservationInput,
): Promise<LanguageObservationRecord> {
  const normalized = normalizePhrase(input.phrase);

  const existing = await db.query.languageObservations.findFirst({
    where: and(
      eq(languageObservations.tenantId, input.tenantId),
      eq(languageObservations.phrase, normalized),
    ),
  });

  if (existing) {
    const nextStatus = existing.status === "customer_confirmed" ? "repeated" : existing.status;
    const [updated] = await db
      .update(languageObservations)
      .set({
        observationCount: existing.observationCount + 1,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(languageObservations.id, existing.id))
      .returning();
    return toRecord(updated);
  }

  const [created] = await db
    .insert(languageObservations)
    .values({
      tenantId: input.tenantId,
      phrase: normalized,
      normalizedMeaning: input.normalizedMeaning,
      intent: input.intent,
      language: input.language ?? "en",
      confidence: input.confidence,
      reason: input.reason,
      context: input.context,
      outcome: input.outcome,
      sourceConversationId: input.sourceConversationId,
    })
    .returning();
  return toRecord(created);
}

/** Records that a customer explicitly confirmed the system's proposed
 * interpretation was correct. Advances "observed" -> "customer_confirmed"
 * the first time; any later confirmation just increments the count
 * (status doesn't regress or change once already confirmed/repeated/
 * approved). No-op-safe against a rejected observation being confirmed
 * later — that combination is left for a human to sort out, not
 * silently resolved here. */
export async function confirmObservation(db: Db, observationId: string): Promise<LanguageObservationRecord> {
  const existing = await db.query.languageObservations.findFirst({
    where: eq(languageObservations.id, observationId),
  });
  if (!existing) {
    throw new Error(`confirmObservation: no language_observations row with id "${observationId}"`);
  }

  const nextStatus = existing.status === "observed" ? "customer_confirmed" : existing.status;
  const [updated] = await db
    .update(languageObservations)
    .set({ confirmationCount: existing.confirmationCount + 1, status: nextStatus, updatedAt: new Date() })
    .where(eq(languageObservations.id, observationId))
    .returning();
  return toRecord(updated);
}

/** Explicit, human-initiated approval — the ONLY thing that marks an
 * observation as safe to eventually influence production behavior. No
 * caller in this codebase does this automatically; it exists for a
 * future admin action. */
export async function approveObservation(db: Db, observationId: string): Promise<LanguageObservationRecord> {
  const [updated] = await db
    .update(languageObservations)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(languageObservations.id, observationId))
    .returning();
  if (!updated) {
    throw new Error(`approveObservation: no language_observations row with id "${observationId}"`);
  }
  return toRecord(updated);
}

export async function rejectObservation(db: Db, observationId: string): Promise<LanguageObservationRecord> {
  const [updated] = await db
    .update(languageObservations)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(languageObservations.id, observationId))
    .returning();
  if (!updated) {
    throw new Error(`rejectObservation: no language_observations row with id "${observationId}"`);
  }
  return toRecord(updated);
}

/** For a future admin interface — e.g. "New language observations...
 * 'put me down fi'... Customer confirmations: 8... Status: REVIEW" (see
 * the mission's own mockup). Ordered by confirmationCount then
 * observationCount, descending — the most-evidenced, most-worth-a-
 * human's-time observations first. `status` defaults to everything
 * NOT already approved/rejected (i.e. what actually needs review). */
export async function listObservationsForReview(
  db: Db,
  tenantId: string,
  status?: LanguageObservationRecord["status"][],
): Promise<LanguageObservationRecord[]> {
  const statuses = status ?? (["observed", "customer_confirmed", "repeated"] as const);
  const rows = await db.query.languageObservations.findMany({
    where: and(
      eq(languageObservations.tenantId, tenantId),
      statuses.length === 1
        ? eq(languageObservations.status, statuses[0])
        : undefined,
    ),
    orderBy: [desc(languageObservations.confirmationCount), desc(languageObservations.observationCount)],
  });
  const filtered = statuses.length === 1 ? rows : rows.filter((r) => (statuses as readonly string[]).includes(r.status));
  return filtered.map(toRecord);
}

function toRecord(row: {
  id: string;
  phrase: string;
  normalizedMeaning: string;
  intent: string;
  language: string;
  confidence: number | null;
  reason: string | null;
  context: string | null;
  outcome: string | null;
  observationCount: number;
  confirmationCount: number;
  status: "observed" | "customer_confirmed" | "repeated" | "approved" | "rejected";
}): LanguageObservationRecord {
  return {
    id: row.id,
    phrase: row.phrase,
    normalizedMeaning: row.normalizedMeaning,
    intent: row.intent,
    language: row.language,
    confidence: row.confidence,
    reason: row.reason,
    context: row.context,
    outcome: row.outcome,
    observationCount: row.observationCount,
    confirmationCount: row.confirmationCount,
    status: row.status,
  };
}
