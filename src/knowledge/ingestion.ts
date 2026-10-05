import type { BusinessContext } from "../ai/types";
import { chunkRetrievalText, chunkText } from "./chunker";
import { extractClaims } from "./claims";
import { scanTenantConflicts } from "./conflicts";
import type { EmbeddingProvider } from "./embedding/provider";
import { neutralizeInjection, REMOVED_MARKER } from "./injection";
import { parseDocument, type ParseInput } from "./parsers";
import type { KnowledgeStore, StoredChunkInput, StoredDocument } from "./store";
import { serviceSubjects } from "./structured-facts";
import { noopTelemetry, type KnowledgeTelemetry } from "./telemetry";
import { normalizeText, sha256 } from "./text";
import type { KnowledgeConflict, KnowledgeDocType, KnowledgeSourceKind, StoredKnowledgeAuthority } from "./types";

/**
 * Ingestion pipeline:
 *
 *   source -> parse -> normalize -> neutralize -> chunk -> claims ->
 *   embed -> store (versioned) -> [human approval] -> available
 *
 * Nothing becomes retrievable by being ingested. Ingestion only produces a
 * `pending_review` (or `draft`) document; a person calls approveDocument.
 * There is deliberately no auto-approve flag here — approval always names
 * the human who gave it.
 */

export interface IngestDeps {
  store: KnowledgeStore;
  embedder: EmbeddingProvider;
  business: BusinessContext;
  telemetry?: KnowledgeTelemetry;
  now?: () => Date;
  /** Called after anything that changes what is retrievable. */
  onChange?: (tenantId: string) => void;
}

export interface IngestRequest {
  tenantId: string;
  /** Stable identity across versions, e.g. "cancellation-policy". */
  docKey: string;
  title: string;
  docType: KnowledgeDocType;
  /** Raw content + type, parsed by the registered parser... */
  content: ParseInput["content"];
  mimeType?: string;
  fileName?: string;
  /** ...and the authority the REVIEWER will grant on approval. An
   * "unreviewed" document is stored but can never be approved. */
  authority: StoredKnowledgeAuthority;
  source?: { kind: KnowledgeSourceKind; title?: string; origin?: string };
  effectiveAt?: Date;
  expiresAt?: Date;
}

export interface IngestResult {
  document: StoredDocument;
  /** True when identical content was already present; nothing was written. */
  duplicate: boolean;
  /** True when instruction-like text was found and neutralized. */
  quarantined: boolean;
  removedSentences: number;
  embeddingFailed: boolean;
}

export class QuarantinedDocumentError extends Error {
  constructor(public readonly documentId: string) {
    super(
      `Document ${documentId} contained instruction-like text and is quarantined. Review it and approve again with acknowledgeQuarantine: true.`,
    );
  }
}

export async function ingestDocument(deps: IngestDeps, req: IngestRequest): Promise<IngestResult> {
  const telemetry = deps.telemetry ?? noopTelemetry;

  // parse -> normalize
  const parsed = await parseDocument({ content: req.content, mimeType: req.mimeType, fileName: req.fileName });
  const normalized = normalizeText(parsed);
  if (!normalized) throw new Error("Document is empty after parsing.");

  // neutralize instruction-like text (the document stays usable)
  const neutralized = neutralizeInjection(normalized);
  const body = neutralized.text;
  const contentHash = sha256(body);

  // idempotent re-ingestion
  const latest = await deps.store.findLatestDocument(req.tenantId, req.docKey);
  if (latest && latest.contentHash === contentHash && !["rejected", "archived", "superseded"].includes(latest.status)) {
    return { document: latest, duplicate: true, quarantined: false, removedSentences: 0, embeddingFailed: false };
  }

  // chunk -> claims
  const subjects = serviceSubjects(deps.business);
  const raw = chunkText(body);
  if (raw.length === 0) throw new Error("Document produced no chunks.");

  // embed (best effort — a document without vectors is still lexically retrievable)
  let vectors: number[][] | null = null;
  let embeddingFailed = false;
  try {
    vectors = await deps.embedder.embed(raw.map((c) => chunkRetrievalText(req.title, c.section, c.content)), "document");
    if (vectors.length !== raw.length) throw new Error("embedding count mismatch");
  } catch {
    embeddingFailed = true;
    vectors = null;
    telemetry.emit("embedding_failed", { tenantId: req.tenantId, docKey: req.docKey });
  }

  const chunks: StoredChunkInput[] = raw.map((c, i) => ({
    ordinal: i,
    section: c.section,
    content: c.content,
    contentHash: sha256(c.content),
    claims: extractClaims(c.content, subjects),
    flaggedInjection: c.content.includes(REMOVED_MARKER),
    embedding: vectors ? vectors[i] : null,
    embeddingModel: vectors ? deps.embedder.id : null,
  }));

  const source = await deps.store.findOrCreateSource({
    tenantId: req.tenantId,
    kind: req.source?.kind ?? "manual",
    title: req.source?.title ?? req.title,
    origin: req.source?.origin ?? req.fileName,
  });

  const document = await deps.store.insertDocument({
    tenantId: req.tenantId,
    sourceId: source.id,
    docKey: req.docKey,
    title: req.title,
    docType: req.docType,
    // Never auto-approved: a human does that, by name.
    status: req.authority === "unreviewed" ? "draft" : "pending_review",
    authority: req.authority,
    body,
    contentHash,
    effectiveAt: req.effectiveAt ?? null,
    expiresAt: req.expiresAt ?? null,
    metadata: neutralized.flagged
      ? { quarantine: { removedSentences: neutralized.removed, count: neutralized.removedCount } }
      : {},
    chunks,
  });

  deps.onChange?.(req.tenantId);
  return {
    document,
    duplicate: false,
    quarantined: neutralized.flagged,
    removedSentences: neutralized.removedCount,
    embeddingFailed,
  };
}

export interface ApproveRequest {
  tenantId: string;
  documentId: string;
  /** The human giving approval. Required and recorded. */
  approvedBy: string;
  /** Must be set to approve a document that was quarantined for
   * instruction-like text — i.e. a person looked at what was removed. */
  acknowledgeQuarantine?: boolean;
}

export interface ApproveResult {
  document: StoredDocument;
  superseded: StoredDocument[];
  conflicts: KnowledgeConflict[];
}

export async function approveDocument(deps: IngestDeps, req: ApproveRequest): Promise<ApproveResult> {
  if (!req.approvedBy.trim()) throw new Error("approveDocument requires the name of the approving person.");
  const existing = await deps.store.getDocument(req.tenantId, req.documentId);
  if (!existing) throw new Error(`no knowledge document "${req.documentId}" for this tenant`);
  if (existing.metadata.quarantine && !req.acknowledgeQuarantine) throw new QuarantinedDocumentError(existing.id);

  const now = (deps.now ?? (() => new Date()))();
  const { document, superseded } = await deps.store.approveDocument(req.tenantId, req.documentId, req.approvedBy.trim(), now);
  deps.onChange?.(req.tenantId);

  // The moment knowledge changes, surface any disagreement to the operator.
  const conflicts = await scanTenantConflicts({ store: deps.store, tenantId: req.tenantId, business: deps.business, now });
  return { document, superseded, conflicts };
}

export async function rejectDocument(deps: IngestDeps, tenantId: string, documentId: string): Promise<StoredDocument> {
  const doc = await deps.store.setDocumentStatus(tenantId, documentId, "rejected");
  deps.onChange?.(tenantId);
  return doc;
}
