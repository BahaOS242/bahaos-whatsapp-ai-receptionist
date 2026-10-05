import type { BusinessContext } from "../ai/types";
import { isServableAuthority, authorityRank } from "./authority";
import { chunkRetrievalText } from "./chunker";
import { extractMoneyCents } from "./claims";
import {
  analyzeConflicts,
  claimSourcesFromBusiness,
  claimSourcesFromChunks,
  forbiddenValues,
  pairKey,
} from "./conflicts";
import { cosineSimilarity, type EmbeddingProvider } from "./embedding/provider";
import { neutralizeInjection } from "./injection";
import type { KnowledgeStore } from "./store";
import { buildStructuredFacts, serviceSubjects } from "./structured-facts";
import { thresholdsFor, type EvidenceThresholds } from "./thresholds";
import { noopTelemetry, type KnowledgeTelemetry } from "./telemetry";
import { contentTerms, sha256 } from "./text";
import type {
  EvidenceItem,
  KnowledgeChunk,
  KnowledgeClaim,
  KnowledgeConflict,
  NoEvidenceReason,
  RetrievalResult,
  StructuredFact,
} from "./types";

/**
 * Tenant-scoped retrieval: candidates -> score -> conflict analysis ->
 * threshold. It returns EVIDENCE with provenance, or an explicit refusal
 * to supply any. It never composes an answer and never touches
 * application state (bookings, calendar, customers).
 *
 * Relevance is two signals, deliberately not trusted alone:
 *   - COVERAGE: the IDF-weighted share of the query's informative terms a
 *     single piece of evidence contains. "pediatric root canals" against a
 *     chunk about root canals covers root+canal but not pediatric, so it
 *     scores well below a chunk that covers all three. Semantic
 *     similarity alone can never clear this bar.
 *   - VECTOR similarity, blended in with a model-specific weight.
 */

export interface RetrieverDeps {
  store: KnowledgeStore;
  embedder: EmbeddingProvider;
  telemetry?: KnowledgeTelemetry;
  now?: () => Date;
  /** How long a tenant's eligible chunks are cached in-process. 0 disables
   * the cache (tests). Ingestion/approval invalidates explicitly; across
   * processes, staleness is bounded by this TTL. */
  cacheTtlMs?: number;
  thresholds?: EvidenceThresholds;
}

export interface RetrieveInput {
  tenantId: string;
  business: BusinessContext;
  /** The (already contextualized) question. */
  query: string;
  /** Extra canonical terms, e.g. from APPROVED language vocabulary. */
  expansionTerms?: string[];
  /** Canonical terms to drop from the query (matched approved slang). */
  ignoreTerms?: string[];
}

interface Candidate {
  origin: "structured_config" | "document";
  authority: EvidenceItem["authority"];
  chunk?: KnowledgeChunk;
  fact?: StructuredFact;
  title: string;
  section: string | null;
  text: string;
  retrievalText: string;
  terms: Set<string>;
  claims: KnowledgeClaim[];
  vector: number[] | null;
  vectorModel: string | null;
}

interface Scored {
  candidate: Candidate;
  coverage: number;
  vectorScore: number;
  score: number;
}

const ATTRIBUTE_TERM: Record<string, string> = { price: "price", duration: "duration", notice_hours: "cancel" };
const MAX_EVIDENCE = 4;

export class Retriever {
  private readonly store: KnowledgeStore;
  private readonly embedder: EmbeddingProvider;
  private readonly telemetry: KnowledgeTelemetry;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly thresholdsOverride?: EvidenceThresholds;
  private readonly chunkCache = new Map<string, { at: number; chunks: KnowledgeChunk[] }>();
  private readonly factVectors = new Map<string, number[]>();

  constructor(deps: RetrieverDeps) {
    this.store = deps.store;
    this.embedder = deps.embedder;
    this.telemetry = deps.telemetry ?? noopTelemetry;
    this.now = deps.now ?? (() => new Date());
    this.cacheTtlMs = deps.cacheTtlMs ?? 15_000;
    this.thresholdsOverride = deps.thresholds;
  }

  invalidate(tenantId?: string): void {
    if (tenantId) this.chunkCache.delete(tenantId);
    else this.chunkCache.clear();
  }

  private async eligibleChunks(tenantId: string, now: Date): Promise<KnowledgeChunk[]> {
    const cached = this.chunkCache.get(tenantId);
    if (cached && this.cacheTtlMs > 0 && Date.now() - cached.at < this.cacheTtlMs) return cached.chunks;
    const chunks = await this.store.listEligibleChunks(tenantId, now);
    if (this.cacheTtlMs > 0) this.chunkCache.set(tenantId, { at: Date.now(), chunks });
    return chunks;
  }

  async retrieve(input: RetrieveInput): Promise<RetrievalResult> {
    const { tenantId, business } = input;
    const now = this.now();
    const thresholds = this.thresholdsOverride ?? thresholdsFor(this.embedder.id);
    this.telemetry.emit("retrieval_started", { tenantId, embeddingModel: this.embedder.id });

    // --- 1. candidates (structured facts + tenant-scoped approved chunks)
    const rawChunks = await this.eligibleChunks(tenantId, now);
    const chunks = rawChunks.filter((c) => c.tenantId === tenantId && isServableAuthority(c.authority));
    if (chunks.length !== rawChunks.length) {
      // Defense in depth: the store already filters by tenant. If a row
      // from elsewhere ever shows up, drop it and make noise.
      this.telemetry.emit("tenant_violation", { tenantId, dropped: rawChunks.length - chunks.length });
    }

    const facts = buildStructuredFacts(business);
    const candidates: Candidate[] = [
      ...facts.map((fact): Candidate => {
        const retrievalText = `${fact.title}. ${fact.text}`;
        return {
          origin: "structured_config",
          authority: "structured_config",
          fact,
          title: fact.title,
          section: null,
          text: fact.text,
          retrievalText,
          terms: new Set(contentTerms(retrievalText)),
          claims: fact.claims,
          vector: null,
          vectorModel: null,
        };
      }),
      ...chunks.map((chunk): Candidate => {
        // Re-neutralize at read time: a row ingested before a newer
        // injection pattern existed is still made inert here.
        const safeText = neutralizeInjection(chunk.content).text;
        const retrievalText = chunkRetrievalText(chunk.documentTitle, chunk.section, safeText);
        return {
          origin: "document",
          authority: chunk.authority,
          chunk,
          title: chunk.documentTitle,
          section: chunk.section,
          text: safeText,
          retrievalText,
          terms: new Set(contentTerms(retrievalText)),
          claims: chunk.claims,
          vector: chunk.embeddingModel === this.embedder.id ? chunk.embedding : null,
          vectorModel: chunk.embeddingModel,
        };
      }),
    ];

    const ignored = new Set(input.ignoreTerms ?? []);
    const queryTerms = [
      ...new Set([...contentTerms(input.query).filter((t) => !ignored.has(t)), ...(input.expansionTerms ?? [])]),
    ];
    const emptyResult = (reason: NoEvidenceReason): RetrievalResult => ({
      outcome: "no_evidence",
      evidence: [],
      considered: [],
      conflicts: [],
      topScore: 0,
      topCoverage: 0,
      noEvidenceReason: reason,
      embeddingModel: this.embedder.id,
      forbiddenAmountsCents: [],
      allowedAmountsCents: [],
    });
    if (queryTerms.length === 0) return emptyResult("low_coverage");
    if (candidates.length === 0) return emptyResult("empty_knowledge");

    // --- 2. lexical coverage (IDF-weighted)
    const N = candidates.length;
    const df = new Map<string, number>();
    for (const c of candidates) for (const t of c.terms) df.set(t, (df.get(t) ?? 0) + 1);
    const idf = (t: string) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
    const totalIdf = queryTerms.reduce((acc, t) => acc + idf(t), 0);
    const coverageOf = (c: Candidate) =>
      totalIdf === 0 ? 0 : queryTerms.reduce((acc, t) => acc + (c.terms.has(t) ? idf(t) : 0), 0) / totalIdf;

    // --- 3. vector similarity (best effort; lexical-only if it fails)
    let vectorWeight = thresholds.vectorWeight;
    let queryVector: number[] | null = null;
    try {
      [queryVector] = await this.embedder.embed([input.query], "query");
      const missing = candidates.filter((c) => c.origin === "structured_config" && c.fact);
      const toEmbed: Array<{ c: Candidate; key: string }> = [];
      for (const c of missing) {
        const key = `${this.embedder.id}:${sha256(c.retrievalText)}`;
        const hit = this.factVectors.get(key);
        if (hit) c.vector = hit;
        else toEmbed.push({ c, key });
      }
      if (toEmbed.length) {
        const vectors = await this.embedder.embed(toEmbed.map((x) => x.c.retrievalText), "document");
        toEmbed.forEach(({ c, key }, i) => {
          this.factVectors.set(key, vectors[i]);
          c.vector = vectors[i];
        });
      }
    } catch {
      this.telemetry.emit("embedding_failed", { tenantId, embeddingModel: this.embedder.id });
      queryVector = null;
      vectorWeight = 0;
    }

    const scored: Scored[] = candidates
      .map((candidate) => {
        const coverage = coverageOf(candidate);
        const vectorScore =
          queryVector && candidate.vector && vectorWeight > 0
            ? Math.max(0, cosineSimilarity(queryVector, candidate.vector))
            : 0;
        const score = (1 - vectorWeight) * coverage + vectorWeight * vectorScore;
        return { candidate, coverage, vectorScore, score };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          authorityRank(a.candidate.authority) - authorityRank(b.candidate.authority) ||
          (b.candidate.chunk?.documentVersion ?? 0) - (a.candidate.chunk?.documentVersion ?? 0),
      );

    const toItem = (s: Scored, i: number): EvidenceItem => ({
      ref: `E${i + 1}`,
      origin: s.candidate.origin,
      authority: s.candidate.authority,
      chunkId: s.candidate.chunk?.id ?? null,
      documentId: s.candidate.chunk?.documentId ?? null,
      documentKey: s.candidate.chunk?.documentKey ?? s.candidate.fact?.key ?? "",
      documentTitle: s.candidate.title,
      documentVersion: s.candidate.chunk?.documentVersion ?? null,
      section: s.candidate.section,
      text: s.candidate.text,
      score: round(s.score),
      coverage: round(s.coverage),
      claims: s.candidate.claims,
    });
    const considered = scored.slice(0, 8).map(toItem);

    // --- 4. conflict analysis over the WHOLE approved base, for the
    //        subjects this question touches
    const sources = [...claimSourcesFromBusiness(business), ...claimSourcesFromChunks(chunks)];
    const pairs = new Set<string>();
    for (const s of scored.slice(0, 5)) for (const claim of s.candidate.claims) pairs.add(pairKey(claim.subject, claim.attribute));
    const queryLower = input.query.toLowerCase();
    const mentioned = new Set<string>();
    for (const subject of serviceSubjects(business)) {
      if (subject.names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(queryLower))) {
        mentioned.add(`service:${subject.id}`);
      }
    }
    if (queryTerms.includes("cancel")) mentioned.add("policy:cancellation");
    for (const source of sources) if (mentioned.has(source.claim.subject)) pairs.add(pairKey(source.claim.subject, source.claim.attribute));

    const conflicts = analyzeConflicts(sources, pairs);
    const knownAttributeTerms = new Set(Object.values(ATTRIBUTE_TERM));
    const queryHasAttributeTerm = queryTerms.some((t) => knownAttributeTerms.has(t));
    const isRelevant = (conflict: KnowledgeConflict) => {
      const attributeTerm = ATTRIBUTE_TERM[conflict.attribute];
      if (attributeTerm && queryTerms.includes(attributeTerm)) return true;
      return mentioned.has(conflict.subject) && !queryHasAttributeTerm;
    };
    const relevant = conflicts.filter(isRelevant);

    const forbiddenCents = new Set<number>();
    for (const conflict of conflicts) {
      if (conflict.attribute !== "price") continue;
      for (const v of forbiddenValues(conflict)) forbiddenCents.add(Number.parseInt(v, 10));
    }

    const isExcluded = (c: Candidate) =>
      relevant.some((conflict) =>
        c.claims.some(
          (claim) =>
            claim.subject === conflict.subject &&
            claim.attribute === conflict.attribute &&
            (conflict.resolution === "needs_confirmation" || claim.value !== conflict.winningValue),
        ),
      );
    const remaining = scored.filter((s) => !isExcluded(s.candidate));

    const best = scored[0];
    const base = {
      considered,
      conflicts,
      topScore: round(best?.score ?? 0),
      topCoverage: round(best?.coverage ?? 0),
      embeddingModel: this.embedder.id,
    };

    // --- 5. outcome
    if (relevant.some((c) => c.resolution === "needs_confirmation")) {
      return {
        outcome: "conflict",
        evidence: [],
        ...base,
        forbiddenAmountsCents: [...forbiddenCents],
        allowedAmountsCents: [],
      };
    }

    const top = remaining[0];
    const sufficient = !!top && top.coverage >= thresholds.minCoverage && top.score >= thresholds.minScore;
    if (!sufficient) {
      return {
        outcome: "no_evidence",
        evidence: [],
        ...base,
        topScore: round(top?.score ?? 0),
        topCoverage: round(top?.coverage ?? 0),
        noEvidenceReason: top && top.coverage >= thresholds.minCoverage ? "below_threshold" : "low_coverage",
        forbiddenAmountsCents: [...forbiddenCents],
        allowedAmountsCents: [],
      };
    }

    const picked = remaining
      .filter((s) => s.score >= top.score * 0.75)
      .filter((s) => s.coverage >= 0.5)
      .slice(0, MAX_EVIDENCE);
    const evidence = picked.map(toItem);
    const allowed = new Set<number>();
    for (const item of evidence) for (const cents of extractMoneyCents(item.text)) allowed.add(cents);
    for (const cents of allowed) forbiddenCents.delete(cents);

    return {
      outcome: "grounded",
      evidence,
      ...base,
      topScore: round(top.score),
      topCoverage: round(top.coverage),
      forbiddenAmountsCents: [...forbiddenCents],
      allowedAmountsCents: [...allowed],
    };
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
