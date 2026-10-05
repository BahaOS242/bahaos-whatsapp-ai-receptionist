import { and, desc, eq, inArray, isNull, lte, gt, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import {
  auditEvents,
  knowledgeChunks,
  knowledgeConflicts,
  knowledgeDocuments,
  knowledgeRetrievalLogs,
  knowledgeSources,
} from "./schema";
import type {
  KnowledgeStore,
  NewDocumentInput,
  RetrievalLogInput,
  StoredConflict,
  StoredDocument,
  StoredRetrievalLog,
  UpsertConflictInput,
} from "../knowledge/store";
import type { KnowledgeGapRecorder } from "../knowledge/knowledge-service";
import type { KnowledgeChunk, KnowledgeDocStatus, KnowledgeSourceKind } from "../knowledge/types";

type DocRow = typeof knowledgeDocuments.$inferSelect;
type ConflictRow = typeof knowledgeConflicts.$inferSelect;

function toDocument(row: DocRow, chunkCount: number): StoredDocument {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceId: row.sourceId,
    docKey: row.docKey,
    version: row.version,
    title: row.title,
    docType: row.docType,
    status: row.status,
    authority: row.authority,
    contentHash: row.contentHash,
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    supersededByDocumentId: row.supersededByDocumentId,
    metadata: row.metadata,
    chunkCount,
  };
}

function toConflict(row: ConflictRow): StoredConflict {
  return {
    id: row.id,
    tenantId: row.tenantId,
    subject: row.subject,
    attribute: row.attribute,
    signature: row.signature,
    resolution: row.resolution as StoredConflict["resolution"],
    status: row.status,
    detail: row.detail,
    detectionCount: row.detectionCount,
    firstDetectedAt: row.firstDetectedAt,
    lastDetectedAt: row.lastDetectedAt,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
  };
}

/**
 * Postgres-backed KnowledgeStore. EVERY query is constrained by tenant_id
 * (and the schema adds composite foreign keys, so a chunk cannot even be
 * written against another tenant's document). Held to the same contract
 * test as InMemoryKnowledgeStore.
 */
export class DrizzleKnowledgeStore implements KnowledgeStore {
  constructor(private readonly db: Db) {}

  private async chunkCount(documentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentId, documentId));
    return row?.n ?? 0;
  }

  async findOrCreateSource(input: { tenantId: string; kind: KnowledgeSourceKind; title: string; origin?: string }) {
    const existing = await this.db.query.knowledgeSources.findFirst({
      where: and(
        eq(knowledgeSources.tenantId, input.tenantId),
        eq(knowledgeSources.kind, input.kind),
        eq(knowledgeSources.title, input.title),
        input.origin ? eq(knowledgeSources.origin, input.origin) : isNull(knowledgeSources.origin),
      ),
    });
    if (existing) return { id: existing.id };
    const [created] = await this.db
      .insert(knowledgeSources)
      .values({ tenantId: input.tenantId, kind: input.kind, title: input.title, origin: input.origin ?? null })
      .returning();
    return { id: created.id };
  }

  async insertDocument(input: NewDocumentInput): Promise<StoredDocument> {
    return this.db.transaction(async (tx) => {
      // Serialize version assignment per (tenant, docKey).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kdoc:${input.tenantId}:${input.docKey}`}))`);
      const [{ maxVersion }] = await tx
        .select({ maxVersion: sql<number>`coalesce(max(${knowledgeDocuments.version}), 0)::int` })
        .from(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.tenantId, input.tenantId), eq(knowledgeDocuments.docKey, input.docKey)));

      const [doc] = await tx
        .insert(knowledgeDocuments)
        .values({
          tenantId: input.tenantId,
          sourceId: input.sourceId,
          docKey: input.docKey,
          version: maxVersion + 1,
          title: input.title,
          docType: input.docType,
          status: input.status,
          authority: input.authority,
          contentHash: input.contentHash,
          body: input.body,
          effectiveAt: input.effectiveAt,
          expiresAt: input.expiresAt,
          metadata: input.metadata,
        })
        .returning();

      if (input.chunks.length) {
        await tx.insert(knowledgeChunks).values(
          input.chunks.map((c) => ({
            tenantId: input.tenantId,
            documentId: doc.id,
            ordinal: c.ordinal,
            section: c.section,
            content: c.content,
            contentHash: c.contentHash,
            claims: c.claims,
            flaggedInjection: c.flaggedInjection,
            embedding: c.embedding,
            embeddingModel: c.embeddingModel,
          })),
        );
      }
      return toDocument(doc, input.chunks.length);
    });
  }

  async getDocument(tenantId: string, documentId: string) {
    const row = await this.db.query.knowledgeDocuments.findFirst({
      where: and(eq(knowledgeDocuments.tenantId, tenantId), eq(knowledgeDocuments.id, documentId)),
    });
    return row ? toDocument(row, await this.chunkCount(row.id)) : null;
  }

  async findLatestDocument(tenantId: string, docKey: string) {
    const row = await this.db.query.knowledgeDocuments.findFirst({
      where: and(eq(knowledgeDocuments.tenantId, tenantId), eq(knowledgeDocuments.docKey, docKey)),
      orderBy: [desc(knowledgeDocuments.version)],
    });
    return row ? toDocument(row, await this.chunkCount(row.id)) : null;
  }

  async listDocuments(tenantId: string, filter?: { status?: KnowledgeDocStatus }) {
    const rows = await this.db.query.knowledgeDocuments.findMany({
      where: and(eq(knowledgeDocuments.tenantId, tenantId), filter?.status ? eq(knowledgeDocuments.status, filter.status) : undefined),
      orderBy: [desc(knowledgeDocuments.createdAt)],
    });
    return Promise.all(rows.map(async (r) => toDocument(r, await this.chunkCount(r.id))));
  }

  async approveDocument(tenantId: string, documentId: string, approvedBy: string, now: Date) {
    return this.db.transaction(async (tx) => {
      const doc = await tx.query.knowledgeDocuments.findFirst({
        where: and(eq(knowledgeDocuments.tenantId, tenantId), eq(knowledgeDocuments.id, documentId)),
      });
      if (!doc) throw new Error(`no knowledge document "${documentId}" for this tenant`);
      if (doc.authority === "unreviewed") {
        throw new Error("an unreviewed document cannot be approved; re-ingest it with a servable authority");
      }
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kdoc:${tenantId}:${doc.docKey}`}))`);

      // Supersede the currently-approved sibling FIRST (the partial unique
      // index allows only one approved version per key).
      const supersededRows = await tx
        .update(knowledgeDocuments)
        .set({ status: "superseded", supersededByDocumentId: doc.id, updatedAt: now })
        .where(
          and(
            eq(knowledgeDocuments.tenantId, tenantId),
            eq(knowledgeDocuments.docKey, doc.docKey),
            eq(knowledgeDocuments.status, "approved"),
            sql`${knowledgeDocuments.id} <> ${doc.id}`,
          ),
        )
        .returning();
      const [approved] = await tx
        .update(knowledgeDocuments)
        .set({ status: "approved", approvedBy, approvedAt: now, updatedAt: now })
        .where(and(eq(knowledgeDocuments.tenantId, tenantId), eq(knowledgeDocuments.id, doc.id)))
        .returning();
      return {
        document: toDocument(approved, 0),
        superseded: supersededRows.map((r) => toDocument(r, 0)),
      };
    });
  }

  async setDocumentStatus(tenantId: string, documentId: string, status: "rejected" | "archived" | "pending_review") {
    const [row] = await this.db
      .update(knowledgeDocuments)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(knowledgeDocuments.tenantId, tenantId), eq(knowledgeDocuments.id, documentId)))
      .returning();
    if (!row) throw new Error(`no knowledge document "${documentId}" for this tenant`);
    return toDocument(row, await this.chunkCount(row.id));
  }

  async listEligibleChunks(tenantId: string, now: Date): Promise<KnowledgeChunk[]> {
    const rows = await this.db
      .select({ chunk: knowledgeChunks, doc: knowledgeDocuments })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        and(eq(knowledgeChunks.documentId, knowledgeDocuments.id), eq(knowledgeChunks.tenantId, knowledgeDocuments.tenantId)),
      )
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          eq(knowledgeDocuments.tenantId, tenantId),
          eq(knowledgeDocuments.status, "approved"),
          inArray(knowledgeDocuments.authority, ["human_approved", "approved_document"]),
          or(isNull(knowledgeDocuments.effectiveAt), lte(knowledgeDocuments.effectiveAt, now)),
          or(isNull(knowledgeDocuments.expiresAt), gt(knowledgeDocuments.expiresAt, now)),
        ),
      )
      .orderBy(knowledgeDocuments.docKey, knowledgeChunks.ordinal);
    return rows.map(({ chunk, doc }) => ({
      id: chunk.id,
      tenantId: chunk.tenantId,
      documentId: doc.id,
      documentKey: doc.docKey,
      documentTitle: doc.title,
      documentVersion: doc.version,
      docType: doc.docType,
      authority: doc.authority,
      ordinal: chunk.ordinal,
      section: chunk.section,
      content: chunk.content,
      claims: chunk.claims,
      flaggedInjection: chunk.flaggedInjection,
      embedding: chunk.embedding,
      embeddingModel: chunk.embeddingModel,
    }));
  }

  async upsertConflict(input: UpsertConflictInput): Promise<StoredConflict> {
    const [row] = await this.db
      .insert(knowledgeConflicts)
      .values({
        tenantId: input.tenantId,
        subject: input.subject,
        attribute: input.attribute,
        signature: input.signature,
        resolution: input.resolution,
        detail: input.detail,
        firstDetectedAt: input.now,
        lastDetectedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [knowledgeConflicts.tenantId, knowledgeConflicts.subject, knowledgeConflicts.attribute, knowledgeConflicts.signature],
        set: {
          detectionCount: sql`${knowledgeConflicts.detectionCount} + 1`,
          lastDetectedAt: input.now,
          resolution: input.resolution,
          detail: input.detail,
          updatedAt: input.now,
        },
      })
      .returning();
    return toConflict(row);
  }

  async listConflicts(tenantId: string, status?: StoredConflict["status"]) {
    const rows = await this.db.query.knowledgeConflicts.findMany({
      where: and(eq(knowledgeConflicts.tenantId, tenantId), status ? eq(knowledgeConflicts.status, status) : undefined),
      orderBy: [desc(knowledgeConflicts.lastDetectedAt)],
    });
    return rows.map(toConflict);
  }

  async resolveConflict(tenantId: string, conflictId: string, status: "resolved" | "dismissed", resolvedBy: string, now: Date) {
    const [row] = await this.db
      .update(knowledgeConflicts)
      .set({ status, resolvedBy, resolvedAt: now, updatedAt: now })
      .where(and(eq(knowledgeConflicts.tenantId, tenantId), eq(knowledgeConflicts.id, conflictId)))
      .returning();
    if (!row) throw new Error(`no knowledge conflict "${conflictId}" for this tenant`);
    return toConflict(row);
  }

  async closeStaleConflicts(tenantId: string, currentSignatures: Set<string>, now: Date) {
    const closed = await this.db
      .update(knowledgeConflicts)
      .set({ status: "resolved", resolvedBy: "system:disagreement-no-longer-present", resolvedAt: now, updatedAt: now })
      .where(
        and(
          eq(knowledgeConflicts.tenantId, tenantId),
          eq(knowledgeConflicts.status, "open"),
          currentSignatures.size ? notInArray(knowledgeConflicts.signature, [...currentSignatures]) : undefined,
        ),
      )
      .returning({ id: knowledgeConflicts.id });
    return closed.length;
  }

  async recordRetrieval(input: RetrievalLogInput) {
    await this.db.insert(knowledgeRetrievalLogs).values({
      tenantId: input.tenantId,
      conversationId: input.conversationId ?? null,
      outcome: input.outcome,
      queryRedacted: input.queryRedacted,
      topScore: input.topScore,
      embeddingModel: input.embeddingModel,
      evidence: input.evidence,
      conflicts: input.conflicts,
    });
  }

  async listRetrievals(tenantId: string, filter?: { conversationId?: string; limit?: number }): Promise<StoredRetrievalLog[]> {
    const rows = await this.db.query.knowledgeRetrievalLogs.findMany({
      where: and(
        eq(knowledgeRetrievalLogs.tenantId, tenantId),
        filter?.conversationId ? eq(knowledgeRetrievalLogs.conversationId, filter.conversationId) : undefined,
      ),
      orderBy: [desc(knowledgeRetrievalLogs.createdAt)],
      limit: filter?.limit ?? 50,
    });
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      conversationId: r.conversationId ?? undefined,
      outcome: r.outcome,
      queryRedacted: r.queryRedacted,
      topScore: r.topScore,
      embeddingModel: r.embeddingModel,
      evidence: r.evidence,
      conflicts: r.conflicts,
      createdAt: r.createdAt,
    }));
  }
}

/** Operator-visible record that a customer asked something the knowledge
 * base could not answer. Reuses the existing audit_events table rather
 * than adding another one. Stores the REDACTED question only. */
export function createDbGapRecorder(db: Db): KnowledgeGapRecorder {
  return {
    async record({ tenantId, conversationId, gap }) {
      await db.insert(auditEvents).values({
        tenantId,
        actorType: "ai",
        eventType: "knowledge.gap",
        entityType: "conversation",
        entityId: conversationId ?? null,
        metadata: { reason: gap.reason, question: gap.question },
      });
    },
  };
}
