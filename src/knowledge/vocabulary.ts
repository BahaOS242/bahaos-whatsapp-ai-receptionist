import { contentTerms } from "./text";

/**
 * Bridge to the EXISTING language-observation lifecycle:
 *
 *   unknown phrase -> clarification -> customer confirms -> language_
 *   observation -> HUMAN REVIEW -> optional promotion -> approved vocabulary
 *
 * The knowledge engine sits at the very end of that pipeline and may read
 * ONLY observations a human has explicitly APPROVED. It never reads
 * observed / customer_confirmed / repeated / rejected rows, and it never
 * writes to language_observations at all — a customer saying a phrase once
 * (or ten times) cannot rewrite what the receptionist retrieves. See
 * src/db/knowledge-vocabulary.ts for the (approved-only) database reader.
 */
export interface ApprovedPhrase {
  phrase: string;
  meaning: string;
}

export interface ApprovedVocabularySource {
  listApproved(tenantId: string): Promise<ApprovedPhrase[]>;
}

export const emptyVocabulary: ApprovedVocabularySource = { async listApproved() { return []; } };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export interface VocabularyExpansion {
  /** Canonical terms of the APPROVED meaning(s) to add to the query. */
  add: string[];
  /** Canonical terms of the matched slang phrase(s) to drop from the
   * query — "how much fi a clean" must be judged as "price of a cleaning",
   * not penalized for containing a word the knowledge base has never seen. */
  ignore: string[];
}

/** Retrieval adjustments from approved phrases present in `message`
 * (e.g. an approved "fi a clean" -> "for a cleaning"). Only APPROVED
 * entries are ever passed in. */
export function expansionFor(message: string, approved: ApprovedPhrase[]): VocabularyExpansion {
  const haystack = norm(message);
  const add = new Set<string>();
  const ignore = new Set<string>();
  for (const entry of approved) {
    const phrase = norm(entry.phrase);
    // Whole-word/phrase match only: an approved "fi" must match the word
    // "fi", never the "fi" inside "filling" or "fine".
    if (phrase.length >= 2 && new RegExp(`(?<![a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(haystack)) {
      for (const t of contentTerms(entry.meaning)) add.add(t);
      for (const t of contentTerms(entry.phrase)) ignore.add(t);
    }
  }
  return { add: [...add], ignore: [...ignore] };
}
