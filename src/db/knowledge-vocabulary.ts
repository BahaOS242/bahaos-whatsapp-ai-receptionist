import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { languageObservations } from "./schema";
import type { ApprovedPhrase, ApprovedVocabularySource } from "../knowledge/vocabulary";

/**
 * The ONLY place the knowledge engine reads language_observations — and it
 * reads exactly one status: `approved`, which only a human sets
 * (approveObservation). Observed / customer_confirmed / repeated /
 * rejected rows are filtered out in SQL, so no amount of customer
 * repetition can influence retrieval. Read-only: nothing here writes.
 */
export function createDbApprovedVocabulary(db: Db): ApprovedVocabularySource {
  return {
    async listApproved(tenantId: string): Promise<ApprovedPhrase[]> {
      const rows = await db
        .select({ phrase: languageObservations.phrase, meaning: languageObservations.normalizedMeaning })
        .from(languageObservations)
        .where(and(eq(languageObservations.tenantId, tenantId), eq(languageObservations.status, "approved")));
      return rows;
    },
  };
}
