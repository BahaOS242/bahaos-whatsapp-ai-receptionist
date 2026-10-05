import type { BusinessContext } from "../ai/types";
import { authorityRank } from "./authority";
import { buildStructuredFacts } from "./structured-facts";
import type { KnowledgeStore } from "./store";
import { sha256 } from "./text";
import type { ConflictingClaim, KnowledgeAuthority, KnowledgeChunk, KnowledgeClaim, KnowledgeConflict } from "./types";

/**
 * Deterministic conflict handling. Two sources disagree about the same
 * (subject, attribute) -> the engine NEVER picks arbitrarily:
 *
 *   - if exactly one value is backed by the highest-ranking authority
 *     present, that value wins ("authority_wins") and the lower-ranked
 *     sources are demoted — the structured price of $125 beats a document
 *     that says $100;
 *   - if the top authority itself is split ("needs_confirmation"), nobody
 *     wins: the engine withholds the value and tells the customer a team
 *     member will confirm.
 *
 * Either way the disagreement is persisted for the business operator.
 */

export interface ClaimSource {
  claim: KnowledgeClaim;
  authority: KnowledgeAuthority;
  documentKey: string;
  documentTitle: string;
  documentVersion: number | null;
  chunkId: string | null;
}

export const pairKey = (subject: string, attribute: string) => `${subject}|${attribute}`;

export function claimSourcesFromChunks(chunks: KnowledgeChunk[]): ClaimSource[] {
  return chunks.flatMap((chunk) =>
    chunk.claims.map((claim) => ({
      claim,
      authority: chunk.authority,
      documentKey: chunk.documentKey,
      documentTitle: chunk.documentTitle,
      documentVersion: chunk.documentVersion,
      chunkId: chunk.id,
    })),
  );
}

export function claimSourcesFromBusiness(business: BusinessContext): ClaimSource[] {
  return buildStructuredFacts(business).flatMap((fact) =>
    fact.claims.map((claim) => ({
      claim,
      authority: "structured_config" as const,
      documentKey: fact.key,
      documentTitle: fact.title,
      documentVersion: null,
      chunkId: null,
    })),
  );
}

/** Groups by (subject, attribute) and reports every group whose sources
 * disagree. `only` restricts the analysis to specific pairs. */
export function analyzeConflicts(sources: ClaimSource[], only?: Set<string>): KnowledgeConflict[] {
  const groups = new Map<string, ClaimSource[]>();
  for (const source of sources) {
    const key = pairKey(source.claim.subject, source.claim.attribute);
    if (only && !only.has(key)) continue;
    const list = groups.get(key) ?? [];
    list.push(source);
    groups.set(key, list);
  }

  const conflicts: KnowledgeConflict[] = [];
  for (const [key, group] of groups) {
    const distinctValues = new Set(group.map((s) => s.claim.value));
    if (distinctValues.size < 2) continue;

    const bestRankByValue = new Map<string, number>();
    for (const source of group) {
      const rank = authorityRank(source.authority);
      const prev = bestRankByValue.get(source.claim.value);
      if (prev === undefined || rank < prev) bestRankByValue.set(source.claim.value, rank);
    }
    const topRank = Math.min(...bestRankByValue.values());
    const topValues = [...bestRankByValue.entries()].filter(([, rank]) => rank === topRank).map(([value]) => value);

    const [subject, attribute] = key.split("|");
    const claims: ConflictingClaim[] = group
      .map((s) => ({
        value: s.claim.value,
        display: s.claim.display,
        authority: s.authority,
        documentKey: s.documentKey,
        documentTitle: s.documentTitle,
        documentVersion: s.documentVersion,
        chunkId: s.chunkId,
      }))
      .sort((a, b) => authorityRank(a.authority) - authorityRank(b.authority) || a.documentKey.localeCompare(b.documentKey));

    conflicts.push(
      topValues.length === 1
        ? { subject, attribute, resolution: "authority_wins", winningValue: topValues[0], claims }
        : { subject, attribute, resolution: "needs_confirmation", claims },
    );
  }
  return conflicts;
}

/** Stable identity of a disagreement: the same competing (value, source)
 * set always hashes the same, so re-detection bumps a counter instead of
 * creating a duplicate row. */
export function conflictSignature(conflict: KnowledgeConflict): string {
  const parts = conflict.claims
    .map((c) => `${c.value}@${c.documentKey}@v${c.documentVersion ?? "cfg"}`)
    .sort()
    .join("|");
  return sha256(`${conflict.subject}|${conflict.attribute}|${parts}`);
}

/** Values that must never be stated: every non-winning value of an
 * authority_wins conflict, and EVERY value of a needs_confirmation one. */
export function forbiddenValues(conflict: KnowledgeConflict): string[] {
  if (conflict.resolution === "authority_wins") {
    return [...new Set(conflict.claims.filter((c) => c.value !== conflict.winningValue).map((c) => c.value))];
  }
  return [...new Set(conflict.claims.map((c) => c.value))];
}

export function describeSubject(subject: string, business: BusinessContext): string {
  if (subject === "policy:cancellation") return "our cancellation policy";
  if (subject.startsWith("service:")) {
    const id = subject.slice("service:".length);
    const service = business.services.find((s) => s.id === id);
    return service ? `${service.name.toLowerCase()} pricing` : "that service";
  }
  return "that";
}

/**
 * Operator-facing scan: examines the ENTIRE approved knowledge base (plus
 * structured config) for disagreements, records each as an open conflict
 * and closes ones that no longer exist. Run after every approval — so a
 * disagreement is visible to the business the moment it is introduced,
 * not only when a customer happens to ask about it.
 */
export async function scanTenantConflicts(params: {
  store: KnowledgeStore;
  tenantId: string;
  business: BusinessContext;
  now: Date;
}): Promise<KnowledgeConflict[]> {
  const { store, tenantId, business, now } = params;
  const chunks = await store.listEligibleChunks(tenantId, now);
  const conflicts = analyzeConflicts([...claimSourcesFromBusiness(business), ...claimSourcesFromChunks(chunks)]);
  const signatures = new Set<string>();
  for (const conflict of conflicts) {
    const signature = conflictSignature(conflict);
    signatures.add(signature);
    await store.upsertConflict({
      tenantId,
      subject: conflict.subject,
      attribute: conflict.attribute,
      signature,
      resolution: conflict.resolution,
      detail: { winningValue: conflict.winningValue ?? null, claims: conflict.claims },
      now,
    });
  }
  await store.closeStaleConflicts(tenantId, signatures, now);
  return conflicts;
}
