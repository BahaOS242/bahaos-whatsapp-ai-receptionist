import type { BusinessContext } from "../ai/types";
import { composeConflictReply, composeNoEvidenceReply } from "./replies";
import { scanTenantConflicts, conflictSignature } from "./conflicts";
import type { EmbeddingProvider } from "./embedding/provider";
import {
  approveDocument,
  ingestDocument,
  rejectDocument,
  type ApproveRequest,
  type ApproveResult,
  type IngestRequest,
  type IngestResult,
} from "./ingestion";
import { decideKnowledgeLookup, contextualizeQuery } from "./query-gate";
import { redactQuery, stripContactDetails } from "./redact";
import { Retriever } from "./retriever";
import type { KnowledgeStore, StoredConflict, StoredDocument } from "./store";
import { serviceSubjects } from "./structured-facts";
import { noopTelemetry, type KnowledgeTelemetry } from "./telemetry";
import { contentTerms, sha256 } from "./text";
import type { EvidenceThresholds } from "./thresholds";
import type {
  KnowledgeGap,
  KnowledgeLookup,
  KnowledgeLookupInput,
  KnowledgeLookupResult,
  RetrievalLogEvidence,
  RetrievalResult,
} from "./types";
import { emptyVocabulary, expansionFor, type ApprovedVocabularySource } from "./vocabulary";

/** Persists "a customer asked something the knowledge base could not
 * answer" for the business operator. */
export interface KnowledgeGapRecorder {
  record(params: { tenantId: string; conversationId?: string; gap: KnowledgeGap }): Promise<void>;
}
export const noopGapRecorder: KnowledgeGapRecorder = { async record() {} };

export class InMemoryGapRecorder implements KnowledgeGapRecorder {
  readonly gaps: Array<{ tenantId: string; conversationId?: string; gap: KnowledgeGap }> = [];
  async record(params: { tenantId: string; conversationId?: string; gap: KnowledgeGap }) {
    this.gaps.push(params);
  }
}

export interface KnowledgeServiceDeps {
  store: KnowledgeStore;
  embedder: EmbeddingProvider;
  telemetry?: KnowledgeTelemetry;
  vocabulary?: ApprovedVocabularySource;
  gapRecorder?: KnowledgeGapRecorder;
  now?: () => Date;
  cacheTtlMs?: number;
  thresholds?: EvidenceThresholds;
}

export interface LookupScope {
  /** Undefined means "no tenant is known for this conversation" — the
   * lookup then consults structured configuration only. It never guesses a
   * tenant. */
  tenantId?: string;
  business: BusinessContext;
  conversationId?: string;
}

/**
 * The knowledge engine's single entry point. `lookupFor(scope)` returns a
 * function BOUND to one tenant: the providers that receive it cannot name
 * a tenant, so they cannot ask for another one's knowledge — tenant
 * isolation is structural, not a convention a caller could forget.
 */
export class KnowledgeService {
  readonly retriever: Retriever;
  private readonly telemetry: KnowledgeTelemetry;
  private readonly vocabulary: ApprovedVocabularySource;
  private readonly gapRecorder: KnowledgeGapRecorder;
  private readonly now: () => Date;

  constructor(private readonly deps: KnowledgeServiceDeps) {
    this.telemetry = deps.telemetry ?? noopTelemetry;
    this.vocabulary = deps.vocabulary ?? emptyVocabulary;
    this.gapRecorder = deps.gapRecorder ?? noopGapRecorder;
    this.now = deps.now ?? (() => new Date());
    this.retriever = new Retriever({
      store: deps.store,
      embedder: deps.embedder,
      telemetry: this.telemetry,
      now: this.now,
      cacheTtlMs: deps.cacheTtlMs,
      thresholds: deps.thresholds,
    });
  }

  get store(): KnowledgeStore {
    return this.deps.store;
  }

  // ---- runtime ---------------------------------------------------------

  lookupFor(scope: LookupScope): KnowledgeLookup {
    return (input) => this.lookup(scope, input);
  }

  private async lookup(scope: LookupScope, input: KnowledgeLookupInput): Promise<KnowledgeLookupResult> {
    const decision = decideKnowledgeLookup(input);
    if (!decision.consult) {
      this.telemetry.emit("knowledge_skipped", { reason: decision.reason });
      return { consulted: false, skipReason: decision.reason };
    }

    const tenantId = scope.tenantId;
    this.telemetry.emit("knowledge_query", {
      tenantId: tenantId ?? null,
      queryHash: sha256(input.message).slice(0, 12),
      length: input.message.length,
    });

    try {
      const subjectTerms = new Set(serviceSubjects(scope.business).flatMap((s) => s.names.flatMap((n) => contentTerms(n))));
      const ctx = contextualizeQuery(stripContactDetails(input.message), input.history, subjectTerms);
      const approved = tenantId ? await this.vocabulary.listApproved(tenantId) : [];
      const vocab = expansionFor(input.message, approved);
      const expansion = [...new Set([...ctx.extraTerms, ...vocab.add])];

      // No tenant known => structured configuration only (an empty,
      // never-shared pseudo-tenant has no stored documents by definition).
      const retrieval = await this.retriever.retrieve({
        tenantId: tenantId ?? "00000000-0000-0000-0000-000000000000",
        business: scope.business,
        query: ctx.extraTerms.length ? `${ctx.text} ${ctx.extraTerms.join(" ")}` : ctx.text,
        expansionTerms: expansion,
        ignoreTerms: vocab.ignore,
      });
      this.emitOutcome(retrieval, tenantId);

      if (tenantId) await this.persist(tenantId, scope.conversationId, input.message, retrieval);
      return { consulted: true, ...retrieval };
    } catch (error) {
      // Fail CLOSED: a lookup that blew up is reported as "no evidence",
      // never as permission for the model to improvise.
      console.error("knowledge lookup failed:", error instanceof Error ? error.message : error);
      this.telemetry.emit("no_evidence", { tenantId: tenantId ?? null, reason: "lookup_error" });
      return {
        consulted: true,
        outcome: "no_evidence",
        evidence: [],
        considered: [],
        conflicts: [],
        topScore: 0,
        topCoverage: 0,
        noEvidenceReason: "lookup_error",
        embeddingModel: this.deps.embedder.id,
        forbiddenAmountsCents: [],
        allowedAmountsCents: [],
      };
    }
  }

  private emitOutcome(r: RetrievalResult, tenantId: string | undefined): void {
    this.telemetry.emit("retrieval_completed", { tenantId: tenantId ?? null, outcome: r.outcome, embeddingModel: r.embeddingModel });
    this.telemetry.emit("documents_retrieved", { count: r.evidence.length, considered: r.considered.length });
    this.telemetry.emit("top_score", { score: r.topScore, coverage: r.topCoverage });
    if (r.outcome === "no_evidence") this.telemetry.emit("no_evidence", { reason: r.noEvidenceReason, topScore: r.topScore });
    if (r.outcome === "conflict") this.telemetry.emit("knowledge_conflict", { count: r.conflicts.length });
    if (r.outcome === "grounded") this.telemetry.emit("grounded_response", { evidence: r.evidence.length, topScore: r.topScore });
  }

  /** Best-effort: persistence problems must never break a customer turn. */
  private async persist(tenantId: string, conversationId: string | undefined, message: string, r: RetrievalResult): Promise<void> {
    try {
      const shown = r.outcome === "grounded" ? r.evidence : r.considered.slice(0, 3);
      await this.deps.store.recordRetrieval({
        tenantId,
        conversationId,
        outcome: r.outcome,
        queryRedacted: redactQuery(message),
        topScore: r.topScore,
        embeddingModel: r.embeddingModel,
        evidence: shown.map(
          (e): RetrievalLogEvidence => ({
            ref: e.ref,
            origin: e.origin,
            authority: e.authority,
            documentKey: e.documentKey,
            documentTitle: e.documentTitle,
            documentVersion: e.documentVersion,
            chunkId: e.chunkId,
            section: e.section,
            score: e.score,
            snippet: e.text.slice(0, 280),
          }),
        ),
        conflicts: r.conflicts.map((c) => ({ subject: c.subject, attribute: c.attribute, resolution: c.resolution })),
      });
      const now = this.now();
      for (const c of r.conflicts) {
        await this.deps.store.upsertConflict({
          tenantId,
          subject: c.subject,
          attribute: c.attribute,
          signature: conflictSignature(c),
          resolution: c.resolution,
          detail: { winningValue: c.winningValue ?? null, claims: c.claims },
          now,
        });
      }
    } catch (error) {
      console.error("knowledge trace persistence failed:", error instanceof Error ? error.message : error);
    }
  }

  /** Called by ReceptionistAgent when a reply was a knowledge refusal. */
  async recordGap(params: { tenantId?: string; conversationId?: string; message: string; reason: KnowledgeGap["reason"] }): Promise<void> {
    this.telemetry.emit("knowledge_escalation", { reason: params.reason });
    if (!params.tenantId) return;
    try {
      await this.gapRecorder.record({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        gap: { reason: params.reason, question: redactQuery(params.message) },
      });
    } catch (error) {
      console.error("knowledge gap recording failed:", error instanceof Error ? error.message : error);
    }
  }

  // ---- operator-side ---------------------------------------------------

  ingest(business: BusinessContext, req: IngestRequest): Promise<IngestResult> {
    return ingestDocument(this.ingestDeps(business), req);
  }
  approve(business: BusinessContext, req: ApproveRequest): Promise<ApproveResult> {
    return approveDocument(this.ingestDeps(business), req);
  }
  reject(business: BusinessContext, tenantId: string, documentId: string): Promise<StoredDocument> {
    return rejectDocument(this.ingestDeps(business), tenantId, documentId);
  }
  async scanConflicts(business: BusinessContext, tenantId: string) {
    return scanTenantConflicts({ store: this.deps.store, tenantId, business, now: this.now() });
  }
  listOpenConflicts(tenantId: string): Promise<StoredConflict[]> {
    return this.deps.store.listConflicts(tenantId, "open");
  }

  /** "Why did the receptionist say this?" — the retrieval traces for a
   * conversation, newest first. */
  explain(tenantId: string, conversationId: string) {
    return this.deps.store.listRetrievals(tenantId, { conversationId });
  }

  private ingestDeps(business: BusinessContext) {
    return {
      store: this.deps.store,
      embedder: this.deps.embedder,
      business,
      telemetry: this.telemetry,
      now: this.now,
      onChange: (tenantId: string) => this.retriever.invalidate(tenantId),
    };
  }
}

export { composeConflictReply, composeNoEvidenceReply };
