/** Shared types for customer memory. See MEMORY_ENGINE.md. */

export type MemoryKind =
  | "preferred_name"
  | "preferred_language"
  | "scheduling_preference"
  | "service_interest"
  | "continuity";

export type MemoryStatus = "active" | "superseded" | "invalidated" | "deleted";
export type MemorySource = "customer_stated" | "staff_entered" | "system_derived";

/** A proposed memory. Never trusted: it must pass validateCandidate. */
export interface MemoryCandidate {
  kind: MemoryKind;
  /** Dedupe key within (customer, kind): "name", "language", "time_of_day", "weekday", "service:<id>", "requested_human"... */
  slot: string;
  value: string;
  display?: string;
  source: MemorySource;
  /** Only "explicit" is storable in Phase 4. */
  provenance: "explicit" | "inferred";
  /** Seconds until expiry (continuity). Absent => no expiry. */
  ttlSeconds?: number;
}

export type RejectReason =
  | "kind_not_allowed"
  | "inferred"
  | "bad_source"
  | "sensitive"
  | "injection"
  | "malformed"
  | "limit"
  | "stale_after_deletion";

export type Validation = { ok: true; candidate: MemoryCandidate } | { ok: false; reason: RejectReason };

export interface StoredMemory {
  id: string;
  kind: MemoryKind;
  slot: string;
  value: string;
  display: string | null;
  status: MemoryStatus;
  source: MemorySource;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export const MAX_ACTIVE_MEMORIES_PER_CUSTOMER = 25;
/** Hard ceiling enforced where the prompt is assembled (llm-provider), independent of the renderer. */
export const MAX_MEMORY_PROMPT_CHARS = 2000;
export const MAX_RETRIEVED_MEMORIES = 5;
export const MAX_MEMORY_BLOCK_CHARS = 600;
export const SERVICE_INQUIRY_TTL_SECONDS = 14 * 24 * 3600;
export const REQUESTED_HUMAN_TTL_SECONDS = 30 * 24 * 3600;
