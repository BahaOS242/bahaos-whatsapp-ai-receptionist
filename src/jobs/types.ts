import type { ZodType } from "zod";
import type { Db } from "../db/client";

/** See BACKGROUND_JOBS.md. */

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/** Retryable: the same job may succeed later (network blip, lock timeout, dependency down). */
export class TransientJobError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "TransientJobError";
  }
}

/** Not retryable: retrying cannot help (invalid state, bad payload, forbidden). */
export class PermanentJobError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export class UnknownJobTypeError extends Error {
  constructor(type: string) {
    super(`unknown job type "${type}"`);
    this.name = "UnknownJobTypeError";
  }
}

export class InvalidJobPayloadError extends Error {
  constructor(type: string, paths: string[]) {
    // paths only — never the offending values (they may be customer data)
    super(`invalid payload for "${type}": ${paths.join(", ") || "(root)"}`);
    this.name = "InvalidJobPayloadError";
  }
}

export class JobIdempotencyConflictError extends Error {
  constructor(public readonly existingJobId: string) {
    super("idempotency key already used by a job with different content");
    this.name = "JobIdempotencyConflictError";
  }
}

/** What a handler returns. `skipped` records that the business state no longer permitted the action. */
export interface JobOutcome {
  skipped?: string;
  /** Small, safe summary (counts, ids). Never customer content. */
  result?: Record<string, unknown>;
}

export interface JobContext {
  jobId: string;
  /** The tenant this job belongs to — the ONLY tenant a handler may act on. */
  tenantId: string;
  type: string;
  /** 1-based number of this execution attempt. */
  attempt: number;
  maxAttempts: number;
  /** Stable per logical job (identical across retries): use as the provider idempotency key. */
  operationId: string;
  db: Db;
  now(): Date;
  /** Aborted on timeout or shutdown. Handlers should stop promptly. */
  signal: AbortSignal;
  /** Extends the lease; false means the lease was lost and the handler must stop. */
  heartbeat(): Promise<boolean>;
}

export interface JobDefinition<P = unknown> {
  type: string;
  /** Payload schema version this handler understands. Other versions are rejected. */
  version: number;
  schema: ZodType<P>;
  handler: (ctx: JobContext, payload: P) => Promise<JobOutcome | void>;
  maxAttempts: number;
  /** Base backoff seconds indexed by (attempt-1), capped at the last entry. */
  backoffSeconds?: number[];
  /** Hard execution deadline. Must be comfortably below the worker lease. */
  timeoutMs: number;
  /** Required statement of why re-execution is safe (documentation, enforced non-empty). */
  idempotency: string;
}

export interface JobRow {
  id: string;
  tenantId: string;
  type: string;
  payloadVersion: number;
  payload: Record<string, unknown>;
  attempt: number;
  maxAttempts: number;
  claimToken: string;
  leaseExpiresAt: Date;
  idempotencyKey: string;
  startedAt: Date;
}
