/**
 * Evidence thresholds. These are MEASURED, not guessed: see
 * tests/knowledge/threshold-calibration.test.ts, which sweeps these values
 * over a labelled question set and fails if the chosen operating point
 * stops separating "answerable" from "must not answer".
 *
 * Thresholds belong to an embedding model: a different model has a
 * different score distribution and must be re-calibrated. Unknown models
 * get the conservative default (lexical coverage is always required, so a
 * semantic score alone can never make an answer "sufficient").
 */
export interface EvidenceThresholds {
  /** Minimum share (0..1) of the query's informative terms, IDF-weighted,
   * that a SINGLE piece of evidence must cover. This is what stops "do you
   * offer pediatric root canals" from being answered by a chunk about
   * (adult) root canal pricing. */
  minCoverage: number;
  /** Minimum blended relevance score (0..1). */
  minScore: number;
  /** Weight of the vector score in the blend. 0 = lexical only. */
  vectorWeight: number;
}

/** Measured for the offline hashing embedder (see the calibration test). */
export const HASHING_EMBEDDER_THRESHOLDS: EvidenceThresholds = {
  minCoverage: 0.68,
  minScore: 0.63,
  vectorWeight: 0.25,
};

/**
 * Any model that has NOT been calibrated gets deliberately STRICT values:
 * better to refuse an answerable question than to answer one the evidence
 * does not support. Lexical coverage is still always required, so a high
 * vector score alone can never make evidence "sufficient". Calibrate a new
 * model (tests/knowledge/threshold-calibration.test.ts) before relaxing.
 */
export const DEFAULT_THRESHOLDS: EvidenceThresholds = {
  minCoverage: 0.8,
  minScore: 0.7,
  vectorWeight: 0.25,
};

const BY_MODEL: Record<string, EvidenceThresholds> = {
  "hash-v1-512": HASHING_EMBEDDER_THRESHOLDS,
};

export function thresholdsFor(embeddingModelId: string | null): EvidenceThresholds {
  return (embeddingModelId && BY_MODEL[embeddingModelId]) || DEFAULT_THRESHOLDS;
}
