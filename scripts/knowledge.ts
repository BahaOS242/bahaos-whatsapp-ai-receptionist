/**
 * Minimal operator CLI for the knowledge engine — the seed/import
 * mechanism this phase calls for (the real admin UI is a later phase).
 * Talks to the real database (DATABASE_URL, migration 0007 applied) for
 * the single demo tenant, using the offline embedder unless VOYAGE_API_KEY
 * is set.
 *
 *   npm run knowledge -- seed-demo
 *   npm run knowledge -- ingest ./cancellation.md --key cancellation-policy \
 *        --title "Cancellation Policy" --type policy --authority human_approved
 *   npm run knowledge -- list [--status pending_review]
 *   npm run knowledge -- approve <documentId> --by "Dr. Rolle" [--ack-quarantine]
 *   npm run knowledge -- reject <documentId>
 *   npm run knowledge -- conflicts
 *   npm run knowledge -- ask "what should I bring?"
 *   npm run knowledge -- why <conversationId>
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getEnv } from "../src/config/env";
import { BAHAMAS_DENTAL_SERVICE } from "../src/ai/business-context";
import { closeDb, getDb } from "../src/db/client";
import { resolveTenant } from "../src/db/domain-resolution";
import { createDbGapRecorder, DrizzleKnowledgeStore } from "../src/db/knowledge-store";
import { createDbApprovedVocabulary } from "../src/db/knowledge-vocabulary";
import { createEmbeddingProvider } from "../src/knowledge/embedding/create-embedding-provider";
import { KnowledgeService } from "../src/knowledge/knowledge-service";
import { seedDemoKnowledge } from "../src/knowledge/seed/demo-knowledge";
import { noopTelemetry } from "../src/knowledge/telemetry";
import type { KnowledgeDocStatus, KnowledgeDocType, StoredKnowledgeAuthority } from "../src/knowledge/types";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const env = getEnv();
  const db = getDb();
  const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
  const service = new KnowledgeService({
    store: new DrizzleKnowledgeStore(db),
    embedder: createEmbeddingProvider(env),
    telemetry: noopTelemetry,
    vocabulary: createDbApprovedVocabulary(db),
    gapRecorder: createDbGapRecorder(db),
    cacheTtlMs: 0,
  });
  const business = BAHAMAS_DENTAL_SERVICE;

  switch (command) {
    case "seed-demo": {
      await seedDemoKnowledge(service, business, tenantId);
      console.log("Demo knowledge seeded and approved.");
      break;
    }
    case "ingest": {
      const file = rest[0];
      if (!file) throw new Error("usage: ingest <file> --key <docKey> --title <title> --type <type> --authority <authority>");
      const result = await service.ingest(business, {
        tenantId,
        docKey: flag(rest, "key") ?? basename(file).replace(/\.[^.]+$/, ""),
        title: flag(rest, "title") ?? basename(file),
        docType: (flag(rest, "type") ?? "document") as KnowledgeDocType,
        authority: (flag(rest, "authority") ?? "approved_document") as StoredKnowledgeAuthority,
        content: await readFile(file),
        fileName: file,
      });
      console.log(
        `${result.duplicate ? "Unchanged (identical content already present)" : "Ingested"}: ${result.document.id} v${result.document.version} [${result.document.status}]` +
          (result.quarantined ? `\n  QUARANTINED: ${result.removedSentences} instruction-like sentence(s) removed — review before approving.` : "") +
          (result.embeddingFailed ? "\n  Embedding failed; document is searchable by keywords only." : ""),
      );
      break;
    }
    case "list": {
      const docs = await service.store.listDocuments(tenantId, { status: flag(rest, "status") as KnowledgeDocStatus | undefined });
      for (const d of docs) console.log(`${d.id}  ${d.docKey} v${d.version}  [${d.status}/${d.authority}]  ${d.title}  (${d.chunkCount} chunks)`);
      break;
    }
    case "approve": {
      const result = await service.approve(business, {
        tenantId,
        documentId: rest[0],
        approvedBy: flag(rest, "by") ?? "",
        acknowledgeQuarantine: rest.includes("--ack-quarantine"),
      });
      console.log(`Approved ${result.document.docKey} v${result.document.version}; superseded ${result.superseded.length} older version(s).`);
      for (const c of result.conflicts) console.log(`  CONFLICT ${c.subject}/${c.attribute}: ${c.resolution}`);
      break;
    }
    case "reject": {
      await service.reject(business, tenantId, rest[0]);
      console.log("Rejected.");
      break;
    }
    case "conflicts": {
      for (const c of await service.listOpenConflicts(tenantId)) {
        console.log(`${c.id}  ${c.subject}/${c.attribute}  ${c.resolution}  seen ${c.detectionCount}x`);
        console.log(`  ${JSON.stringify(c.detail)}`);
      }
      break;
    }
    case "ask": {
      const lookup = service.lookupFor({ tenantId, business });
      const r = await lookup({
        message: rest.join(" "),
        history: [],
        context: { hasActiveIntent: false, hasPendingConfirmation: false, extractedBookingField: false },
      });
      if (!r.consulted) {
        console.log(`Not a knowledge question (${r.skipReason}).`);
        break;
      }
      console.log(`${r.outcome.toUpperCase()}  top score ${r.topScore}, coverage ${r.topCoverage}${r.noEvidenceReason ? `, reason ${r.noEvidenceReason}` : ""}`);
      for (const e of r.evidence) console.log(`  [${e.ref}] ${e.authority} · ${e.documentTitle}${e.documentVersion ? ` v${e.documentVersion}` : ""} · score ${e.score}\n      ${e.text.slice(0, 160)}`);
      break;
    }
    case "why": {
      for (const t of await service.explain(tenantId, rest[0])) {
        console.log(`${t.createdAt.toISOString()}  ${t.outcome.toUpperCase()}  "${t.queryRedacted}"  top ${t.topScore}`);
        for (const e of t.evidence) console.log(`   ${e.authority} · ${e.documentTitle}${e.documentVersion ? ` v${e.documentVersion}` : ""} · ${e.score} · "${e.snippet.slice(0, 100)}"`);
      }
      break;
    }
    default:
      console.log("commands: seed-demo | ingest | list | approve | reject | conflicts | ask | why");
  }
  await closeDb();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
