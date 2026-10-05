import { randomUUID } from "node:crypto";
import { describeKnowledgeStoreContract } from "./store-contract";
import { InMemoryKnowledgeStore } from "../../src/knowledge/memory-store";

describeKnowledgeStoreContract("InMemoryKnowledgeStore", async () => ({
  store: new InMemoryKnowledgeStore(),
  tenantA: randomUUID(),
  tenantB: randomUUID(),
}));
