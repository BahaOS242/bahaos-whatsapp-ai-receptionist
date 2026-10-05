import { randomUUID } from "node:crypto";
import {
  isEligibleDocument,
  type KnowledgeStore,
  type NewDocumentInput,
  type RetrievalLogInput,
  type StoredConflict,
  type StoredDocument,
  type StoredRetrievalLog,
  type UpsertConflictInput,
} from "./store";
import type { KnowledgeChunk, KnowledgeDocStatus, KnowledgeSourceKind } from "./types";

interface DocRecord extends Omit<StoredDocument, "chunkCount"> {
  body: string;
}
interface ChunkRecord {
  id: string;
  tenantId: string;
  documentId: string;
  ordinal: number;
  section: string | null;
  content: string;
  claims: KnowledgeChunk["claims"];
  flaggedInjection: boolean;
  embedding: number[] | null;
  embeddingModel: string | null;
}

/** In-memory KnowledgeStore: no database, same semantics as the Drizzle
 * store (held to the same contract test). Used for local dev, `npm run
 * chat`, and the bulk of the unit tests. */
export class InMemoryKnowledgeStore implements KnowledgeStore {
  private sources: Array<{ id: string; tenantId: string; kind: KnowledgeSourceKind; title: string; origin?: string }> = [];
  private docs: DocRecord[] = [];
  private chunks: ChunkRecord[] = [];
  private conflicts: StoredConflict[] = [];
  private retrievals: Array<StoredRetrievalLog & { seq: number }> = [];
  private seq = 0;

  async findOrCreateSource(input: { tenantId: string; kind: KnowledgeSourceKind; title: string; origin?: string }) {
    const found = this.sources.find(
      (s) => s.tenantId === input.tenantId && s.kind === input.kind && s.title === input.title && s.origin === input.origin,
    );
    if (found) return { id: found.id };
    const created = { id: randomUUID(), ...input };
    this.sources.push(created);
    return { id: created.id };
  }

  private view(doc: DocRecord): StoredDocument {
    const { body: _body, ...rest } = doc;
    return { ...rest, metadata: { ...rest.metadata }, chunkCount: this.chunks.filter((c) => c.documentId === doc.id).length };
  }

  async insertDocument(input: NewDocumentInput): Promise<StoredDocument> {
    const source = this.sources.find((s) => s.id === input.sourceId && s.tenantId === input.tenantId);
    if (!source) throw new Error("insertDocument: source does not belong to this tenant");
    const version =
      Math.max(0, ...this.docs.filter((d) => d.tenantId === input.tenantId && d.docKey === input.docKey).map((d) => d.version)) + 1;
    const doc: DocRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      sourceId: input.sourceId,
      docKey: input.docKey,
      version,
      title: input.title,
      docType: input.docType,
      status: input.status,
      authority: input.authority,
      contentHash: input.contentHash,
      effectiveAt: input.effectiveAt,
      expiresAt: input.expiresAt,
      approvedBy: null,
      approvedAt: null,
      supersededByDocumentId: null,
      metadata: { ...input.metadata },
      body: input.body,
    };
    this.docs.push(doc);
    for (const c of input.chunks) {
      this.chunks.push({
        id: randomUUID(),
        tenantId: input.tenantId,
        documentId: doc.id,
        ordinal: c.ordinal,
        section: c.section,
        content: c.content,
        claims: c.claims,
        flaggedInjection: c.flaggedInjection,
        embedding: c.embedding,
        embeddingModel: c.embeddingModel,
      });
    }
    return this.view(doc);
  }

  private mustFind(tenantId: string, documentId: string): DocRecord {
    const doc = this.docs.find((d) => d.id === documentId && d.tenantId === tenantId);
    if (!doc) throw new Error(`no knowledge document "${documentId}" for this tenant`);
    return doc;
  }

  async getDocument(tenantId: string, documentId: string) {
    const doc = this.docs.find((d) => d.id === documentId && d.tenantId === tenantId);
    return doc ? this.view(doc) : null;
  }

  async findLatestDocument(tenantId: string, docKey: string) {
    const matches = this.docs.filter((d) => d.tenantId === tenantId && d.docKey === docKey).sort((a, b) => b.version - a.version);
    return matches[0] ? this.view(matches[0]) : null;
  }

  async listDocuments(tenantId: string, filter?: { status?: KnowledgeDocStatus }) {
    return this.docs
      .filter((d) => d.tenantId === tenantId && (!filter?.status || d.status === filter.status))
      .map((d) => this.view(d));
  }

  async approveDocument(tenantId: string, documentId: string, approvedBy: string, now: Date) {
    const doc = this.mustFind(tenantId, documentId);
    if (doc.authority === "unreviewed") throw new Error("an unreviewed document cannot be approved; re-ingest it with a servable authority");
    const superseded: StoredDocument[] = [];
    for (const other of this.docs) {
      if (other.tenantId === tenantId && other.docKey === doc.docKey && other.id !== doc.id && other.status === "approved") {
        other.status = "superseded";
        other.supersededByDocumentId = doc.id;
        superseded.push(this.view(other));
      }
    }
    doc.status = "approved";
    doc.approvedBy = approvedBy;
    doc.approvedAt = now;
    return { document: this.view(doc), superseded };
  }

  async setDocumentStatus(tenantId: string, documentId: string, status: "rejected" | "archived" | "pending_review") {
    const doc = this.mustFind(tenantId, documentId);
    doc.status = status;
    return this.view(doc);
  }

  async listEligibleChunks(tenantId: string, now: Date): Promise<KnowledgeChunk[]> {
    const out: KnowledgeChunk[] = [];
    for (const doc of this.docs) {
      if (doc.tenantId !== tenantId || !isEligibleDocument(doc, now)) continue;
      for (const c of this.chunks.filter((x) => x.documentId === doc.id && x.tenantId === tenantId)) {
        out.push({
          id: c.id,
          tenantId: c.tenantId,
          documentId: doc.id,
          documentKey: doc.docKey,
          documentTitle: doc.title,
          documentVersion: doc.version,
          docType: doc.docType,
          authority: doc.authority,
          ordinal: c.ordinal,
          section: c.section,
          content: c.content,
          claims: c.claims,
          flaggedInjection: c.flaggedInjection,
          embedding: c.embedding,
          embeddingModel: c.embeddingModel,
        });
      }
    }
    return out;
  }

  async upsertConflict(input: UpsertConflictInput): Promise<StoredConflict> {
    const existing = this.conflicts.find(
      (c) => c.tenantId === input.tenantId && c.subject === input.subject && c.attribute === input.attribute && c.signature === input.signature,
    );
    if (existing) {
      existing.detectionCount += 1;
      existing.lastDetectedAt = input.now;
      existing.resolution = input.resolution;
      existing.detail = input.detail;
      return { ...existing };
    }
    const created: StoredConflict = {
      id: randomUUID(),
      tenantId: input.tenantId,
      subject: input.subject,
      attribute: input.attribute,
      signature: input.signature,
      resolution: input.resolution,
      status: "open",
      detail: input.detail,
      detectionCount: 1,
      firstDetectedAt: input.now,
      lastDetectedAt: input.now,
      resolvedBy: null,
      resolvedAt: null,
    };
    this.conflicts.push(created);
    return { ...created };
  }

  async listConflicts(tenantId: string, status?: StoredConflict["status"]) {
    return this.conflicts.filter((c) => c.tenantId === tenantId && (!status || c.status === status)).map((c) => ({ ...c }));
  }

  async resolveConflict(tenantId: string, conflictId: string, status: "resolved" | "dismissed", resolvedBy: string, now: Date) {
    const c = this.conflicts.find((x) => x.id === conflictId && x.tenantId === tenantId);
    if (!c) throw new Error(`no knowledge conflict "${conflictId}" for this tenant`);
    c.status = status;
    c.resolvedBy = resolvedBy;
    c.resolvedAt = now;
    return { ...c };
  }

  async closeStaleConflicts(tenantId: string, currentSignatures: Set<string>, now: Date) {
    let closed = 0;
    for (const c of this.conflicts) {
      if (c.tenantId === tenantId && c.status === "open" && !currentSignatures.has(c.signature)) {
        c.status = "resolved";
        c.resolvedBy = "system:disagreement-no-longer-present";
        c.resolvedAt = now;
        closed += 1;
      }
    }
    return closed;
  }

  async recordRetrieval(input: RetrievalLogInput) {
    this.retrievals.push({ ...input, id: randomUUID(), createdAt: new Date(), seq: this.seq++ });
  }

  async listRetrievals(tenantId: string, filter?: { conversationId?: string; limit?: number }) {
    return this.retrievals
      .filter((r) => r.tenantId === tenantId && (!filter?.conversationId || r.conversationId === filter.conversationId))
      // Newest first; the insertion sequence breaks ties so ordering never
      // depends on clock resolution (or a frozen test clock).
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.seq - a.seq)
      .slice(0, filter?.limit ?? 50)
      .map(({ seq: _seq, ...log }) => log);
  }
}
