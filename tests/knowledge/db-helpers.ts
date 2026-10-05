import type { KnowledgeService } from "../../src/knowledge/knowledge-service";
import type { KnowledgeDocType, StoredKnowledgeAuthority } from "../../src/knowledge/types";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";

export const IDLE = { hasActiveIntent: false, hasPendingConfirmation: false, extractedBookingField: false };

/** Ingest + approve one document through a (DB-backed) service. */
export async function addApprovedTo(
  service: KnowledgeService,
  tenantId: string,
  doc: { docKey: string; title: string; text: string; authority?: StoredKnowledgeAuthority; docType?: KnowledgeDocType },
) {
  const ingested = await service.ingest(BAHAMAS_DENTAL_SERVICE, {
    tenantId, docKey: doc.docKey, title: doc.title, docType: doc.docType ?? "policy", content: doc.text,
    mimeType: "text/markdown", authority: doc.authority ?? "approved_document",
  });
  return service.approve(BAHAMAS_DENTAL_SERVICE, { tenantId, documentId: ingested.document.id, approvedBy: "test-reviewer" });
}
