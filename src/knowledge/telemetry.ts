/**
 * Structured, PII-light observability for the knowledge engine. Events:
 *
 *   knowledge_query, retrieval_started, retrieval_completed,
 *   documents_retrieved, top_score, no_evidence, knowledge_conflict,
 *   grounded_response, knowledge_escalation
 *
 * (plus knowledge_skipped, answer_guard_blocked, tenant_violation,
 * embedding_failed). Fields are ids, counts and scores — never the
 * customer's message or any document text.
 */
export type KnowledgeEvent =
  | "knowledge_query"
  | "knowledge_skipped"
  | "retrieval_started"
  | "retrieval_completed"
  | "documents_retrieved"
  | "top_score"
  | "no_evidence"
  | "knowledge_conflict"
  | "grounded_response"
  | "knowledge_escalation"
  | "answer_guard_blocked"
  | "tenant_violation"
  | "embedding_failed";

export interface KnowledgeTelemetry {
  emit(event: KnowledgeEvent, fields?: Record<string, string | number | boolean | null | undefined>): void;
}

export const noopTelemetry: KnowledgeTelemetry = { emit() {} };

/** One JSON line per event on stdout, in the same console-based style as
 * the rest of the project (there is no logging library). */
export const consoleTelemetry: KnowledgeTelemetry = {
  emit(event, fields) {
    console.info(JSON.stringify({ scope: "knowledge", event, ...fields }));
  },
};

/** Collects events in memory — for tests. */
export class RecordingTelemetry implements KnowledgeTelemetry {
  readonly events: Array<{ event: KnowledgeEvent; fields: Record<string, unknown> }> = [];
  emit(event: KnowledgeEvent, fields: Record<string, unknown> = {}) {
    this.events.push({ event, fields });
  }
  names(): KnowledgeEvent[] {
    return this.events.map((e) => e.event);
  }
}
