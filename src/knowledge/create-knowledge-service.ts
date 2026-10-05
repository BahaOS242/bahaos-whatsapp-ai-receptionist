import type { Env } from "../config/env";
import { getEnv } from "../config/env";
import { getDb } from "../db/client";
import { createDbGapRecorder, DrizzleKnowledgeStore } from "../db/knowledge-store";
import { createDbApprovedVocabulary } from "../db/knowledge-vocabulary";
import { createEmbeddingProvider } from "./embedding/create-embedding-provider";
import { InMemoryGapRecorder, KnowledgeService } from "./knowledge-service";
import { InMemoryKnowledgeStore } from "./memory-store";
import { consoleTelemetry, noopTelemetry, type KnowledgeTelemetry } from "./telemetry";

/**
 * The knowledge engine, or `undefined` when KNOWLEDGE_ENABLED is off — in
 * which case ReceptionistAgent gets no engine and the receptionist behaves
 * exactly as it did before the engine existed.
 *
 *   DB_BOOKING_ENABLED  -> Postgres-backed store (tenant-scoped rows),
 *                          approved-only language vocabulary, operator
 *                          gap records in audit_events.
 *   otherwise           -> in-memory store (local dev / `npm run chat`).
 *
 * Mirrors createAiProvider/createReceptionistTools: `env`/`db` are
 * injectable so tests never depend on a developer's real .env.
 */
export function createKnowledgeService(
  env: Env = getEnv(),
  db?: ReturnType<typeof getDb>,
  options: { telemetry?: KnowledgeTelemetry } = {},
): KnowledgeService | undefined {
  if (!env.KNOWLEDGE_ENABLED) return undefined;

  const embedder = createEmbeddingProvider(env);
  const telemetry = options.telemetry ?? (env.NODE_ENV === "test" ? noopTelemetry : consoleTelemetry);

  if (env.DB_BOOKING_ENABLED) {
    const database = db ?? getDb();
    return new KnowledgeService({
      store: new DrizzleKnowledgeStore(database),
      embedder,
      telemetry,
      vocabulary: createDbApprovedVocabulary(database),
      gapRecorder: createDbGapRecorder(database),
    });
  }
  return new KnowledgeService({
    store: new InMemoryKnowledgeStore(),
    embedder,
    telemetry,
    gapRecorder: new InMemoryGapRecorder(),
  });
}
