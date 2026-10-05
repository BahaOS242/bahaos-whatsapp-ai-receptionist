import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../src/config/env";
import { createKnowledgeService } from "../../src/knowledge/create-knowledge-service";
import { createEmbeddingProvider } from "../../src/knowledge/embedding/create-embedding-provider";
import { HashingEmbedder } from "../../src/knowledge/embedding/hashing-embedder";
import { cosineSimilarity } from "../../src/knowledge/embedding/provider";
import { VoyageEmbedder } from "../../src/knowledge/embedding/voyage-embedder";

const baseEnv = { DATABASE_URL: "postgres://localhost/x" };

describe("hashing embedder (offline, deterministic)", () => {
  const e = new HashingEmbedder();

  it("is deterministic, unit-length, fixed-dimension and honest about not being semantic", async () => {
    const [a1] = await e.embed(["free parking behind the building"]);
    const [a2] = await e.embed(["free parking behind the building"]);
    expect(a1).toEqual(a2);
    expect(a1).toHaveLength(512);
    expect(Math.hypot(...a1)).toBeCloseTo(1, 6);
    expect(e.semantic).toBe(false);
    expect(e.id).toBe("hash-v1-512");
  });

  it("ranks a related text above an unrelated one", async () => {
    const [q, related, unrelated] = await e.embed(["is there parking", "Free parking behind the building", "Cancel two hours before your visit"]);
    expect(cosineSimilarity(q, related)).toBeGreaterThan(cosineSimilarity(q, unrelated));
  });

  it("empty text embeds to the zero vector (cosine 0, no NaN)", async () => {
    const [z, v] = await e.embed(["", "parking"]);
    expect(cosineSimilarity(z, v)).toBe(0);
  });
});

describe("Voyage embedder (mocked fetch — NOT exercised against the live API)", () => {
  const okResponse = (n: number) =>
    new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: n - 1 - i, embedding: [i, i + 1] })) }), { status: 200 });

  it("sends the key as a bearer header, the right input_type, batches, and restores order", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return okResponse(body.input.length);
    });
    const v = new VoyageEmbedder({ apiKey: "sk-test", fetchImpl: fetchImpl as unknown as typeof fetch, batchSize: 2, dimensions: 2 });
    const out = await v.embed(["a", "b", "c"], "query");
    expect(fetchImpl).toHaveBeenCalledTimes(2); // batches of 2 + 1
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.voyageai.com/v1/embeddings");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(init?.body))).toMatchObject({ input_type: "query", model: "voyage-3.5-lite" });
    expect(out).toHaveLength(3);
    expect(v.semantic).toBe(true);
    expect(v.id).toBe("voyage:voyage-3.5-lite:2");
  });

  it("errors never leak the key or the request body", async () => {
    const v = new VoyageEmbedder({ apiKey: "sk-secret", fetchImpl: (async () => new Response("denied", { status: 401 })) as unknown as typeof fetch });
    const err = await v.embed(["secret customer text"], "document").catch((e: Error) => e);
    expect(String(err)).toContain("401");
    expect(String(err)).not.toContain("sk-secret");
    expect(String(err)).not.toContain("secret customer text");
  });

  it("rejects malformed responses", async () => {
    const v = new VoyageEmbedder({ apiKey: "k", fetchImpl: (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof fetch });
    await expect(v.embed(["a"], "document")).rejects.toThrow(/unexpected shape/);
  });
});

describe("provider selection and configuration", () => {
  it("no credentials => the offline embedder; a Voyage key => Voyage", () => {
    expect(createEmbeddingProvider({}).id).toBe("hash-v1-512");
    expect(createEmbeddingProvider({ VOYAGE_API_KEY: "k", VOYAGE_EMBEDDING_MODEL: "voyage-3.5-lite" }).id).toMatch(/^voyage:/);
  });

  it("KNOWLEDGE_ENABLED defaults to OFF and needs no other configuration", () => {
    const env = loadEnv({ ...baseEnv });
    expect(env.KNOWLEDGE_ENABLED).toBe(false);
    expect(createKnowledgeService(env)).toBeUndefined();
  });

  it("KNOWLEDGE_ENABLED=true works with ZERO credentials (in-memory store, offline embedder)", () => {
    const env = loadEnv({ ...baseEnv, KNOWLEDGE_ENABLED: "true" });
    expect(env.KNOWLEDGE_ENABLED).toBe(true);
    expect(createKnowledgeService(env)).toBeDefined();
  });

  it("rejects a malformed flag value", () => {
    expect(() => loadEnv({ ...baseEnv, KNOWLEDGE_ENABLED: "yes" })).toThrow(/KNOWLEDGE_ENABLED/);
  });

  it("OpenAI is not an embedding option (standing project constraint)", () => {
    const env = loadEnv({ ...baseEnv, KNOWLEDGE_ENABLED: "true", OPENAI_API_KEY: "sk-openai" });
    expect(createEmbeddingProvider(env).id).toBe("hash-v1-512");
  });
});
