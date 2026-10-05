import type { BusinessContext } from "../../ai/types";
import type { KnowledgeService } from "../knowledge-service";
import type { KnowledgeDocType, StoredKnowledgeAuthority } from "../types";

/**
 * DEMO knowledge for the single demo tenant (BAHAMAS_DENTAL_SERVICE). Like
 * the rest of that tenant's configuration, every statement here is a
 * documented demo PLACEHOLDER, not real clinic policy — the minimal
 * seed/import mechanism this phase calls for (the admin UI is a later
 * phase). Deliberately consistent with the structured configuration
 * (e.g. the 2-hour cancellation cutoff) so a fresh demo has no conflicts,
 * and deliberately silent on some things (pediatric endodontics,
 * orthodontics...) so "I don't have that information" has something real
 * to be tested against.
 */
export interface DemoDocument {
  docKey: string;
  title: string;
  docType: KnowledgeDocType;
  authority: StoredKnowledgeAuthority;
  text: string;
}

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    docKey: "cancellation-policy",
    title: "Cancellation Policy",
    docType: "policy",
    authority: "human_approved",
    text: `# Cancellation Policy

## Cancelling or rescheduling
Please give us at least 2 hours before your appointment if you need to cancel or reschedule. Cancellations made with less notice may mean we cannot offer that time to another patient.

## No-shows
If you miss an appointment without telling us, please contact the office to rebook. Repeated missed appointments may affect how far ahead we can book you.`,
  },
  {
    docKey: "first-visit",
    title: "Your First Visit",
    docType: "faq",
    authority: "human_approved",
    text: `Q: What should I bring to my first appointment?
A: Please bring a photo ID, your insurance card if you have one, and a list of any medications you take.

Q: How early should I arrive?
A: New patients should arrive 15 minutes early to complete a short registration form.`,
  },
  {
    docKey: "payment-methods",
    title: "Payment Methods",
    docType: "faq",
    authority: "human_approved",
    text: `Q: How can I pay for my visit?
A: We accept cash, Visa and Mastercard credit cards, and most debit cards. Payment is due at the time of service.`,
  },
  {
    docKey: "parking-and-access",
    title: "Parking and Access",
    docType: "faq",
    authority: "approved_document",
    text: `Q: Is there parking at the office?
A: Yes, there is free parking behind the building. The entrance is wheelchair accessible.`,
  },
  {
    docKey: "patients-of-all-ages",
    title: "Patients of All Ages",
    docType: "faq",
    authority: "approved_document",
    text: `Q: Do you see children?
A: We welcome patients of all ages. A parent or guardian must accompany any patient under 18.`,
  },
];

/** Ingests and approves the demo corpus for `tenantId`. Idempotent:
 * re-running leaves unchanged documents alone (content-hash dedupe). */
export async function seedDemoKnowledge(
  service: KnowledgeService,
  business: BusinessContext,
  tenantId: string,
  approvedBy = "demo-seed",
): Promise<void> {
  for (const doc of DEMO_DOCUMENTS) {
    const result = await service.ingest(business, {
      tenantId,
      docKey: doc.docKey,
      title: doc.title,
      docType: doc.docType,
      content: doc.text,
      mimeType: "text/markdown",
      authority: doc.authority,
      source: { kind: "manual", title: "Demo seed" },
    });
    if (result.document.status !== "approved") {
      await service.approve(business, {
        tenantId,
        documentId: result.document.id,
        approvedBy,
        acknowledgeQuarantine: false,
      });
    }
  }
}
