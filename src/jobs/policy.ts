import { PermanentJobError, TransientJobError } from "./types";

/** Default base backoff (seconds) by attempt; capped at the last entry. */
export const DEFAULT_BACKOFF_SECONDS = [15, 30, 60, 120, 300, 600, 900];

/** Exponential-style backoff with ±20% jitter, bounded by the table's last entry. */
export function jobBackoffSeconds(attempt: number, table: number[] = DEFAULT_BACKOFF_SECONDS, rng: () => number = Math.random): number {
  const base = table[Math.min(Math.max(attempt, 1) - 1, table.length - 1)];
  return Math.round(base * (0.8 + 0.4 * rng()));
}

export interface FailureClassification {
  retryable: boolean;
  code: string;
  /** Only author-controlled JobError text is ever persisted; arbitrary exceptions are reduced to their class name. */
  message: string;
}

export function classifyJobError(error: unknown): FailureClassification {
  if (error instanceof PermanentJobError) return { retryable: false, code: error.code.slice(0, 64), message: error.message.slice(0, 300) };
  if (error instanceof TransientJobError) return { retryable: true, code: error.code.slice(0, 64), message: error.message.slice(0, 300) };
  const name = error instanceof Error ? error.name : "NonError";
  return { retryable: true, code: "unhandled_exception", message: `unhandled ${name}` };
}

export type FailureDecision =
  | { kind: "retry"; runAtSeconds: number }
  | { kind: "fail"; reason: "permanent" | "attempts_exhausted" };

export function decideAfterFailure(
  c: FailureClassification,
  attempt: number,
  maxAttempts: number,
  table?: number[],
  rng?: () => number,
): FailureDecision {
  if (!c.retryable) return { kind: "fail", reason: "permanent" };
  if (attempt >= maxAttempts) return { kind: "fail", reason: "attempts_exhausted" };
  return { kind: "retry", runAtSeconds: jobBackoffSeconds(attempt, table, rng) };
}
