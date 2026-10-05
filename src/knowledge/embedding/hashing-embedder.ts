import { embeddingTokens } from "../text";
import type { EmbeddingProvider } from "./provider";

/**
 * Deterministic, offline embedder (signed feature hashing over canonical
 * terms and term bigrams). Needs no credentials and no network, so the
 * application — and every test — works with zero configuration.
 *
 * HONEST LIMITS: this is a lexical-shape embedding. It rewards shared
 * (canonicalized) words and phrases; it does NOT understand that "teeth
 * whitening" and "bleaching" are related unless the synonym table in
 * text.ts says so. `semantic: false` tells retrieval not to over-trust it.
 * A real model (see voyage-embedder.ts) is the production upgrade.
 */
export const HASHING_EMBEDDER_ID = "hash-v1-512";

function fnv1a(input: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class HashingEmbedder implements EmbeddingProvider {
  readonly id = HASHING_EMBEDDER_ID;
  readonly dimensions: number;
  readonly semantic = false;

  constructor(dimensions = 512) {
    this.dimensions = dimensions;
  }

  private vectorize(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = embeddingTokens(text);
    const add = (feature: string, weight: number) => {
      const index = fnv1a(feature, 0) % this.dimensions;
      const sign = fnv1a(feature, 0x9e3779b1) & 1 ? 1 : -1;
      vec[index] += sign * weight;
    };
    tokens.forEach((token, i) => {
      add(`u:${token}`, 1);
      if (i > 0) add(`b:${tokens[i - 1]}_${token}`, 0.5);
    });
    const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
    return norm === 0 ? vec : vec.map((v) => v / norm);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectorize(t));
  }
}
