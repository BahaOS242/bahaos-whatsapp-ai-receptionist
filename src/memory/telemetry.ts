/** PII-free memory observability: ids, counts, reason codes — never values or message text. */
export type MemoryEvent =
  | "candidates_proposed"
  | "candidate_accepted"
  | "candidate_rejected"
  | "retrieval"
  | "memory_corrected"
  | "memory_invalidated"
  | "memory_deleted"
  | "memory_control_request"
  | "extraction_failed"
  | "retrieval_failed";

export interface MemoryTelemetry {
  emit(event: MemoryEvent, fields?: Record<string, string | number | boolean | null | undefined>): void;
}

export const noopMemoryTelemetry: MemoryTelemetry = { emit() {} };
export const consoleMemoryTelemetry: MemoryTelemetry = {
  emit(event, fields) {
    console.info(JSON.stringify({ scope: "memory", event, ...fields }));
  },
};
