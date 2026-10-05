import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleKnowledgeStore } from "../../src/db/knowledge-store";
import { conversations, customers, knowledgeChunks, knowledgeDocuments, knowledgeSources, tenants } from "../../src/db/schema";
import { describeKnowledgeStoreContract } from "../knowledge/store-contract";
import { createTestDb, resetTestData } from "./db-test-helpers";

/** Postgres-backed KnowledgeStore. REQUIRES the test database with
 * migration 0007 applied — see appointments-concurrency.test.ts's header. */
const { db, pool } = createTestDb();

afterAll(async () => {
  await resetTestData(db);
  await pool.end();
});

async function makeTenant(slug: string) {
  const [t] = await db.insert(tenants).values({ slug: `${slug}-${randomUUID().slice(0, 8)}`, name: slug, timezone: "UTC" }).returning();
  return t.id;
}

// The very same behavioural contract the in-memory store passes.
describeKnowledgeStoreContract("DrizzleKnowledgeStore (Postgres)", async () => {
  await resetTestData(db);
  const tenantA = await makeTenant("a");
  const tenantB = await makeTenant("b");
  const [customer] = await db.insert(customers).values({ tenantId: tenantA, whatsappId: "12420000001" }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: tenantA, customerId: customer.id }).returning();
  return { store: new DrizzleKnowledgeStore(db), tenantA, tenantB, conversationA: conversation.id };
});

describe("knowledge schema — tenant integrity is enforced by the DATABASE, not just by application code", () => {
  let a: string;
  let b: string;
  let docA: string;
  let sourceA: string;

  beforeEach(async () => {
    await resetTestData(db);
    a = await makeTenant("a");
    b = await makeTenant("b");
    const [src] = await db.insert(knowledgeSources).values({ tenantId: a, kind: "manual", title: "S" }).returning();
    sourceA = src.id;
    const [d] = await db
      .insert(knowledgeDocuments)
      .values({ tenantId: a, sourceId: src.id, docKey: "k", version: 1, title: "K", docType: "faq", contentHash: "h", body: "b" })
      .returning();
    docA = d.id;
  });

  it("a chunk cannot be attached to another tenant's document (composite foreign key)", async () => {
    await expect(
      db.insert(knowledgeChunks).values({ tenantId: b, documentId: docA, ordinal: 0, content: "x", contentHash: "h" }),
    ).rejects.toThrow();
    // ...but the legitimate pairing works:
    await expect(db.insert(knowledgeChunks).values({ tenantId: a, documentId: docA, ordinal: 0, content: "x", contentHash: "h" })).resolves.toBeDefined();
  });

  it("a document cannot reference another tenant's source (composite foreign key)", async () => {
    await expect(
      db.insert(knowledgeDocuments).values({ tenantId: b, sourceId: sourceA, docKey: "k", version: 1, title: "K", docType: "faq", contentHash: "h", body: "b" }),
    ).rejects.toThrow();
  });

  it("only ONE approved version per (tenant, docKey) can exist — the database refuses a second", async () => {
    await db.update(knowledgeDocuments).set({ status: "approved", authority: "human_approved" });
    await expect(
      db.insert(knowledgeDocuments).values({
        tenantId: a, sourceId: sourceA, docKey: "k", version: 2, title: "K2", docType: "faq", contentHash: "h2", body: "b", status: "approved", authority: "human_approved",
      }),
    ).rejects.toThrow();
    // A different key, or a non-approved status, is fine:
    await expect(
      db.insert(knowledgeDocuments).values({ tenantId: a, sourceId: sourceA, docKey: "k", version: 3, title: "K3", docType: "faq", contentHash: "h3", body: "b", status: "pending_review" }),
    ).resolves.toBeDefined();
  });

  it("version numbers and chunk ordinals are unique", async () => {
    await expect(
      db.insert(knowledgeDocuments).values({ tenantId: a, sourceId: sourceA, docKey: "k", version: 1, title: "dup", docType: "faq", contentHash: "z", body: "b" }),
    ).rejects.toThrow();
    await db.insert(knowledgeChunks).values({ tenantId: a, documentId: docA, ordinal: 0, content: "x", contentHash: "h" });
    await expect(db.insert(knowledgeChunks).values({ tenantId: a, documentId: docA, ordinal: 0, content: "y", contentHash: "h" })).rejects.toThrow();
  });

  it("deleting a document removes its chunks", async () => {
    await db.insert(knowledgeChunks).values({ tenantId: a, documentId: docA, ordinal: 0, content: "x", contentHash: "h" });
    await db.delete(knowledgeDocuments);
    expect(await db.select().from(knowledgeChunks)).toEqual([]);
  });

  it("embeddings round-trip as float arrays", async () => {
    await db.insert(knowledgeChunks).values({ tenantId: a, documentId: docA, ordinal: 0, content: "x", contentHash: "h", embedding: [0.25, -0.5, 1], embeddingModel: "m" });
    const [row] = await db.select().from(knowledgeChunks);
    expect(row.embedding).toEqual([0.25, -0.5, 1]);
  });
});

describe("knowledge store — concurrency", () => {
  beforeEach(async () => resetTestData(db));

  it("concurrent approvals of competing versions leave exactly ONE approved (no error, no two-approved window)", async () => {
    const tenant = await makeTenant("c");
    const store = new DrizzleKnowledgeStore(db);
    const source = await store.findOrCreateSource({ tenantId: tenant, kind: "manual", title: "S" });
    const versions = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        store.insertDocument({
          tenantId: tenant, sourceId: source.id, docKey: "policy", title: "P", docType: "policy", status: "pending_review", authority: "human_approved",
          body: `v${i}`, contentHash: `h${i}`, effectiveAt: null, expiresAt: null, metadata: {}, chunks: [],
        }),
      ),
    );
    expect(new Set(versions.map((v) => v.version)).size).toBe(5); // version assignment is serialized, no duplicates
    await Promise.all(versions.map((v) => store.approveDocument(tenant, v.id, "r", new Date())));
    const docs = await store.listDocuments(tenant);
    expect(docs.filter((d) => d.status === "approved")).toHaveLength(1);
    expect(docs.filter((d) => d.status === "superseded")).toHaveLength(4);
  });
});
