/** Privacy-conscious job logging: ids, types, counts, reason codes. Never payloads, results, messages or provider bodies. */
export type JobEvent =
  | "enqueued" | "deduplicated" | "claimed" | "completed" | "skipped" | "retry_scheduled" | "failed"
  | "lease_lost" | "lease_exhausted" | "cancelled" | "requeued" | "worker_started" | "worker_stopped" | "poll_error";

export type JobLogFields = Record<string, string | number | boolean | null | undefined>;

export interface JobTelemetry {
  emit(event: JobEvent, fields?: JobLogFields): void;
}

export const noopJobTelemetry: JobTelemetry = { emit() {} };
export const consoleJobTelemetry: JobTelemetry = {
  emit(event, fields) {
    console.info(JSON.stringify({ scope: "jobs", event, ...fields }));
  },
};
