/**
 * Minimal abstraction over "turn text into vectors". The knowledge engine
 * depends on this interface, never on a vendor SDK — mirroring how
 * LLMProvider depends on LlmChatClient. Swapping the embedding vendor
 * means writing one class here; nothing else changes.
 */
export interface EmbeddingProvider {
  /** Stable identifier, stored with every vector. Vectors from DIFFERENT
   * ids are never compared. Changing models therefore means re-embedding
   * (the engine falls back to lexical-only for stale-model chunks). */
  readonly id: string;
  readonly dimensions: number;
  /** True only for a model that understands meaning beyond shared words.
   * The local hashing embedder is NOT semantic and must say so: it
   * affects how much retrieval trusts the vector score. */
  readonly semantic: boolean;
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
