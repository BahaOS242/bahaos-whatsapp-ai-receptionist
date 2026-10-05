/**
 * Shared types for the BahaOS Knowledge / RAG engine. See
 * KNOWLEDGE_ENGINE.md for the architecture these implement.
 *
 * The governing rule: the LLM interprets language, the application
 * determines truth. Nothing in this module can decide availability,
 * bookings, customer identity, or any other application state — it only
 * supplies BUSINESS FACTS, each tagged with where it came from and how
 * much authority that source has.
 */

/**
 * Authority hierarchy, strongest first. Lower tiers must NEVER override
 * higher ones (src/knowledge/authority.ts enforces the ordering).
 *
 *   1. application/database truth   — appointments, calendar, customers.
 *                                     Not knowledge; never retrieved.
 *   2. structured_config            — BusinessContext / services table:
 *                                     prices, durations, hours, address.
 *   3. human_approved               — a person wrote or signed off on it.
 *   4. approved_document            — an approved uploaded/imported doc.
 *   5. unreviewed                   — imported/crawled/draft text. Stored,
 *                                     but NEVER served to a customer.
 *   6. LLM general knowledge        — never a source of business facts.
 */
export type KnowledgeAuthority = "structured_config" | "human_approved" | "approved_document" | "unreviewed";

/** The authority tiers a STORED document can hold (structured_config lives
 * in configuration, never in these tables). */
export type StoredKnowledgeAuthority = Exclude<KnowledgeAuthority, "structured_config">;

export type KnowledgeDocType = "faq" | "policy" | "article" | "document";
export type KnowledgeDocStatus =
  "draft" | "pending_review" | "approved" | "superseded" | "rejected" | "archived";
export type KnowledgeSourceKind = "manual" | "document" | "website" | "import";

/** A deterministic, comparable statement extracted from text or supplied
 * by structured config — the unit conflict detection works on. */
export interface KnowledgeClaim {
  /** What the claim is about, e.g. "service:root_canal". */
  subject: string;
  /** What is claimed, e.g. "price" | "duration". */
  attribute: string;
  /** Normalized, comparable value: cents for price, minutes for duration. */
  value: string;
  /** Human-readable form, e.g. "$500". Display only. */
  display: string;
}

/** A retrievable, tenant-scoped, APPROVED piece of document knowledge. */
export interface KnowledgeChunk {
  id: string;
  tenantId: string;
  documentId: string;
  documentKey: string;
  documentTitle: string;
  documentVersion: number;
  docType: KnowledgeDocType;
  authority: StoredKnowledgeAuthority;
  ordinal: number;
  section: string | null;
  content: string;
  claims: KnowledgeClaim[];
  flaggedInjection: boolean;
  embedding: number[] | null;
  embeddingModel: string | null;
}

/** A fact derived from structured configuration (authority tier 2). */
export interface StructuredFact {
  /** Stable key, e.g. "service:cleaning:price" or "hours". */
  key: string;
  title: string;
  text: string;
  claims: KnowledgeClaim[];
}

/** One piece of evidence handed to the model — with full provenance. */
export interface EvidenceItem {
  /** Short handle used inside the prompt: "E1", "E2"... */
  ref: string;
  origin: "structured_config" | "document";
  authority: KnowledgeAuthority;
  /** null for structured facts. */
  chunkId: string | null;
  documentId: string | null;
  documentKey: string;
  documentTitle: string;
  documentVersion: number | null;
  section: string | null;
  text: string;
  /** Final blended relevance, 0..1. */
  score: number;
  /** IDF-weighted share of the query's informative terms this evidence
   * covers, 0..1. */
  coverage: number;
  claims: KnowledgeClaim[];
}

export interface ConflictingClaim {
  value: string;
  display: string;
  authority: KnowledgeAuthority;
  documentKey: string;
  documentTitle: string;
  documentVersion: number | null;
  chunkId: string | null;
}

export type ConflictResolution = "authority_wins" | "needs_confirmation";

export interface KnowledgeConflict {
  subject: string;
  attribute: string;
  resolution: ConflictResolution;
  /** The value the engine will stand behind (authority_wins only). */
  winningValue?: string;
  claims: ConflictingClaim[];
}

/** Compact form persisted in knowledge_retrieval_logs. */
export interface RetrievalLogEvidence {
  ref: string;
  origin: "structured_config" | "document";
  authority: KnowledgeAuthority;
  documentKey: string;
  documentTitle: string;
  documentVersion: number | null;
  chunkId: string | null;
  section: string | null;
  score: number;
  /** First ~280 chars only. */
  snippet: string;
}
export interface RetrievalLogConflict {
  subject: string;
  attribute: string;
  resolution: ConflictResolution;
}

export type NoEvidenceReason = "empty_knowledge" | "below_threshold" | "low_coverage" | "lookup_error";

export type RetrievalOutcome = "grounded" | "no_evidence" | "conflict";

export interface RetrievalResult {
  outcome: RetrievalOutcome;
  /** Evidence the model may use. Empty unless outcome === "grounded". */
  evidence: EvidenceItem[];
  /** Everything considered, best first, INCLUDING items excluded for
   * conflicts — for the trace only. */
  considered: EvidenceItem[];
  conflicts: KnowledgeConflict[];
  topScore: number;
  topCoverage: number;
  noEvidenceReason?: NoEvidenceReason;
  embeddingModel: string | null;
  /** Prices (cents) that must NOT appear in a reply: values that lost a
   * conflict or are unresolved. */
  forbiddenAmountsCents: number[];
  /** Prices (cents) the reply may state: from non-excluded evidence. */
  allowedAmountsCents: number[];
}

/** Minimal structural view of a chat turn — keeps this module free of an
 * import cycle with src/ai/types. */
export interface KnowledgeHistoryTurn {
  role: "customer" | "assistant";
  content: string;
}

export interface KnowledgeLookupInput {
  message: string;
  history: KnowledgeHistoryTurn[];
  /** State the gate needs, nothing more. */
  context: {
    hasActiveIntent: boolean;
    hasPendingConfirmation: boolean;
    /** True when deterministic extraction already found a booking field
     * (date/time/name/phone/service) in THIS message. */
    extractedBookingField: boolean;
  };
}

/** What a provider receives. Tenant-bound at construction: a provider can
 * not name a tenant, so it cannot ask for another tenant's knowledge. */
export type KnowledgeLookupResult =
  | { consulted: false; skipReason: string }
  | ({ consulted: true } & RetrievalResult);

export type KnowledgeLookup = (input: KnowledgeLookupInput) => Promise<KnowledgeLookupResult>;

/** Emitted (best-effort) for the operator when a customer asked something
 * the knowledge base could not answer. */
export interface KnowledgeGap {
  reason: NoEvidenceReason | "conflict" | "answer_guard";
  /** Redacted, truncated question. */
  question: string;
}
