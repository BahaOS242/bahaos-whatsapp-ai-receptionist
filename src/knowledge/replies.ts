import type { BusinessContext } from "../ai/types";
import { describeSubject } from "./conflicts";
import { contentTerms } from "./text";
import type { EvidenceItem, KnowledgeConflict } from "./types";

/**
 * The fixed, deterministic customer-facing wording for the two outcomes
 * where the engine refuses to let a model improvise. Neither claims that a
 * human has already been contacted — they OFFER one, and the operator-side
 * record (knowledge gap / conflict) is what actually flags it.
 */

export const NO_EVIDENCE_REPLY =
  "I don't have that information available right now. I can have someone from the office confirm that for you.";

export function composeNoEvidenceReply(options: { midBooking: boolean }): string {
  return options.midBooking
    ? `${NO_EVIDENCE_REPLY} Whenever you're ready, we can pick your booking back up where we left off.`
    : NO_EVIDENCE_REPLY;
}

export function composeConflictReply(
  conflicts: KnowledgeConflict[],
  business: BusinessContext,
  options: { midBooking: boolean },
): string {
  const what = conflicts.find((c) => c.resolution === "needs_confirmation") ?? conflicts[0];
  const label = what ? describeSubject(what.subject, business) : "that";
  const reply = `I want to make sure I give you accurate information, and I'm seeing different details for ${label} in our records. I can have someone from the office confirm that for you.`;
  return options.midBooking ? `${reply} Whenever you're ready, we can pick your booking back up where we left off.` : reply;
}

/**
 * Deterministic, EXTRACTIVE answer for providers with no language model
 * (DevRuleBasedAIProvider): the best sentence(s) of the best evidence,
 * quoted as written. It can only ever repeat what the evidence says.
 */
export function composeExtractiveAnswer(evidence: EvidenceItem[], query: string): string {
  const best = evidence[0];
  if (!best) return NO_EVIDENCE_REPLY;
  // An FAQ chunk is "Q: ...\nA: ..." — answer with the A part.
  const faq = /^Q:.*\nA:\s*([\s\S]+)$/.exec(best.text);
  const text = (faq ? faq[1] : best.text).trim();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 2) return text;
  const queryTerms = new Set(contentTerms(query));
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      hits: contentTerms(sentence).filter((t) => queryTerms.has(t)).length,
    }))
    .sort((a, b) => b.hits - a.hits || a.index - b.index);
  const chosen = ranked.filter((r) => r.hits > 0).slice(0, 2).sort((a, b) => a.index - b.index);
  return (chosen.length ? chosen.map((c) => c.sentence) : sentences.slice(0, 2)).join(" ");
}
