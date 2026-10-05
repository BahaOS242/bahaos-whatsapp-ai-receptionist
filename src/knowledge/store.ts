import type {
  ConflictResolution,
  StoredKnowledgeAuthority,
  KnowledgeChunk,
  KnowledgeClaim,
  KnowledgeDocStatus,
  KnowledgeDocType,
  KnowledgeSourceKind,
  RetrievalLogConflict,
  RetrievalLogEvidence,
  RetrievalOutcome,
} from "./types";

/**
 * Persistence boundary for the knowledge engine. Two implementations
 * exist and are held to the SAME contract test (tests/knowledge/
 * store-contract): InMemoryKnowledgeStore (dev, unit tests) and
 * DrizzleKnowledgeStore (Postgres). EVERY method takes a tenantId and
 * every implementation filters on it — there is no un-scoped read.
 */

export interface StoredChunkInput {
  ordinal: number;
  section: string | null;
  content: string;
  contentHash: string;
  claims: KnowledgeClaim[];
  flaggedInjection: boolean;
  embedding: number[] | null;
  embeddingModel: string | null;
}

export interface NewDocumentInput {
  tenantId: string;
  sourceId: string;
  docKey: string;
  title: string;
  docType: KnowledgeDocType;
  status: Extract<KnowledgeDocStatus, "draft" | "pending_review">;
  authority: StoredKnowledgeAuthority;
  body: string;
  contentHash: string;
  effectiveAt: Date | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
  chunks: StoredChunkInput[];
}

export interface StoredDocument {
  id: string;
  tenantId: string;
  sourceId: string;
  docKey: string;
  version: number;
  title: string;
  docType: KnowledgeDocType;
  status: KnowledgeDocStatus;
  authority: StoredKnowledgeAuthority;
  contentHash: string;
  effectiveAt: Date | null;
  expiresAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  supersededByDocumentId: string | null;
  metadata: Record<string, unknown>;
  chunkCount: number;
}

export interface StoredConflict {
  id: string;
  tenantId: string;
  subject: string;
  attribute: string;
  signature: string;
  resolution: ConflictResolution;
  status: "open" | "resolved" | "dismissed";
  detail: Record<string, unknown>;
  detectionCount: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  resolvedBy: string | null;
  resolvedAt: Date | null;
}

export interface UpsertConflictInput {
  tenantId: string;
  subject: string;
  attribute: string;
  signature: string;
  resolution: ConflictResolution;
  detail: Record<string, unknown>;
  now: Date;
}

export interface RetrievalLogInput {
  tenantId: string;
  conversationId?: string;
  outcome: RetrievalOutcome;
  queryRedacted: string;
  topScore: number | null;
  embeddingModel: string | null;
  evidence: RetrievalLogEvidence[];
  conflicts: RetrievalLogConflict[];
}

export interface StoredRetrievalLog extends RetrievalLogInput {
  id: string;
  createdAt: Date;
}

export interface KnowledgeStore {
  findOrCreateSource(input: {
    tenantId: string;
    kind: KnowledgeSourceKind;
    title: string;
    origin?: string;
  }): Promise<{ id: string }>;

  /** Assigns the next version for (tenant, docKey). */
  insertDocument(input: NewDocumentInput): Promise<StoredDocument>;
  getDocument(tenantId: string, documentId: string): Promise<StoredDocument | null>;
  findLatestDocument(tenantId: string, docKey: string): Promise<StoredDocument | null>;
  listDocuments(tenantId: string, filter?: { status?: KnowledgeDocStatus }): Promise<StoredDocument[]>;

  /**
   * Atomically: supersede the currently-approved version of the same
   * docKey (if any) and approve this one. At most one approved version per
   * (tenant, docKey) ever exists.
   */
  approveDocument(
    tenantId: string,
    documentId: string,
    approvedBy: string,
    now: Date,
  ): Promise<{ document: StoredDocument; superseded: StoredDocument[] }>;
  setDocumentStatus(
    tenantId: string,
    documentId: string,
    status: Extract<KnowledgeDocStatus, "rejected" | "archived" | "pending_review">,
  ): Promise<StoredDocument>;

  /** Chunks of approved, servable, in-date documents — the ONLY thing
   * retrieval can ever see. */
  listEligibleChunks(tenantId: string, now: Date): Promise<KnowledgeChunk[]>;

  upsertConflict(input: UpsertConflictInput): Promise<StoredConflict>;
  listConflicts(tenantId: string, status?: StoredConflict["status"]): Promise<StoredConflict[]>;
  resolveConflict(
    tenantId: string,
    conflictId: string,
    status: "resolved" | "dismissed",
    resolvedBy: string,
    now: Date,
  ): Promise<StoredConflict>;
  /** Closes open conflicts of this tenant whose signature is NOT in
   * `currentSignatures` (the disagreement no longer exists). */
  closeStaleConflicts(tenantId: string, currentSignatures: Set<string>, now: Date): Promise<number>;

  recordRetrieval(input: RetrievalLogInput): Promise<void>;
  listRetrievals(
    tenantId: string,
    filter?: { conversationId?: string; limit?: number },
  ): Promise<StoredRetrievalLog[]>;
}

/** Shared eligibility rule so both stores agree exactly. */
export function isEligibleDocument(
  doc: Pick<StoredDocument, "status" | "authority" | "effectiveAt" | "expiresAt">,
  now: Date,
): boolean {
  if (doc.status !== "approved") return false;
  if (doc.authority === "unreviewed") return false;
  if (doc.effectiveAt && doc.effectiveAt.getTime() > now.getTime()) return false;
  if (doc.expiresAt && doc.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
