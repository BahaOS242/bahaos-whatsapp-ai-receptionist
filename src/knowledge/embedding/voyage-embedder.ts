import type { EmbeddingProvider } from "./provider";

/**
 * Voyage AI embeddings (Anthropic's recommended embeddings partner) over
 * plain HTTPS — no SDK dependency. Anthropic itself has no embeddings
 * endpoint, and OpenAI is deliberately NOT used anywhere in this project
 * (standing constraint), which is why this is the optional remote
 * provider.
 *
 * `fetchImpl` is injectable so tests can prove the request/response
 * handling without network access. NOTE: this class has been exercised
 * only against a mocked fetch; it has not been run against the live API.
 */
export interface VoyageEmbedderOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;
}

export class VoyageEmbedder implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  readonly semantic = true;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly batchSize: number;

  constructor(options: VoyageEmbedderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "voyage-3.5-lite";
    this.dimensions = options.dimensions ?? 1024;
    this.baseUrl = options.baseUrl ?? "https://api.voyageai.com/v1";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.batchSize = options.batchSize ?? 64;
    this.id = `voyage:${this.model}:${this.dimensions}`;
  }

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ input: batch, model: this.model, input_type: kind, output_dimension: this.dimensions }),
      });
      if (!response.ok) {
        // Never include the key or the request body in the error.
        throw new Error(`Voyage embeddings request failed with status ${response.status}.`);
      }
      const json = (await response.json()) as { data?: Array<{ embedding?: number[]; index?: number }> };
      const data = json.data;
      if (!Array.isArray(data) || data.length !== batch.length) {
        throw new Error("Voyage embeddings response had an unexpected shape.");
      }
      const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      for (const item of ordered) {
        if (!Array.isArray(item.embedding)) throw new Error("Voyage embeddings response was missing a vector.");
        out.push(item.embedding);
      }
    }
    return out;
  }
}
