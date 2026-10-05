import { HashingEmbedder } from "./hashing-embedder";
import type { EmbeddingProvider } from "./provider";
import { VoyageEmbedder } from "./voyage-embedder";

export interface EmbeddingEnv {
  VOYAGE_API_KEY?: string;
  VOYAGE_EMBEDDING_MODEL?: string;
}

/**
 * Voyage when VOYAGE_API_KEY is configured, otherwise the offline hashing
 * embedder — so local development, CI and every test run with zero
 * credentials. Same "degrade explicitly, never require" pattern as
 * createAiProvider.
 */
export function createEmbeddingProvider(env: EmbeddingEnv): EmbeddingProvider {
  if (env.VOYAGE_API_KEY) {
    return new VoyageEmbedder({ apiKey: env.VOYAGE_API_KEY, model: env.VOYAGE_EMBEDDING_MODEL });
  }
  return new HashingEmbedder();
}
