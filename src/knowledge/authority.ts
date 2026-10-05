import type { KnowledgeAuthority } from "./types";

/**
 * Authority ordering. LOWER rank number = MORE authoritative. A lower
 * tier can never override a higher one — this is the single place that
 * ordering is defined.
 *
 *   1  application/database truth (appointments, calendar, customers)
 *        — not knowledge at all, so it has no entry here: nothing in this
 *        module can read or answer from it, by construction.
 *   2  structured_config   (BusinessContext / services table)
 *   3  human_approved
 *   4  approved_document
 *   5  unreviewed          (never served to a customer)
 *   6  LLM general knowledge — never a source of business facts.
 */
const RANK: Record<KnowledgeAuthority, number> = {
  structured_config: 2,
  human_approved: 3,
  approved_document: 4,
  unreviewed: 5,
};

export function authorityRank(authority: KnowledgeAuthority): number {
  return RANK[authority];
}

/** Negative when `a` outranks `b`. */
export function compareAuthority(a: KnowledgeAuthority, b: KnowledgeAuthority): number {
  return RANK[a] - RANK[b];
}

/** Only these tiers may ever reach a customer-facing answer. */
export function isServableAuthority(authority: KnowledgeAuthority): boolean {
  return authority !== "unreviewed";
}

export const AUTHORITY_LABEL: Record<KnowledgeAuthority, string> = {
  structured_config: "business configuration",
  human_approved: "human-approved knowledge",
  approved_document: "approved document",
  unreviewed: "unreviewed",
};
