import { extractMoneyCents } from "./claims";
import type { RetrievalResult } from "./types";

/**
 * Deterministic check of a model's REPLY against the evidence it was
 * given. The model's compliance with "only use the evidence" is never
 * assumed: a reply that states a price the application cannot account for
 * is replaced, whether the cause is hallucination, a conflicting source,
 * or a prompt-injection that talked the model into it.
 */

export interface GuardInput {
  reply: string;
  customerMessage: string;
  /** Every price the structured configuration legitimately contains. */
  businessPricesCents: number[];
  result: Extract<RetrievalResult, { outcome: "grounded" }> | RetrievalResult;
}

export type GuardVerdict = { ok: true } | { ok: false; reason: "ungrounded_amount" | "forbidden_amount" | "prompt_leak"; detail: string };

/** Fragments that only appear in OUR prompt. A reply containing them is a
 * prompt leak, whatever the model was talked into. */
const PROMPT_LEAK_MARKERS = [
  "BEGIN RETRIEVED BUSINESS KNOWLEDGE",
  "END RETRIEVED BUSINESS KNOWLEDGE",
  "UNTRUSTED REFERENCE DATA",
  "Structured weekly hours",
  "Current booking state (already confirmed",
  "Next required field:",
  "Handoff state:",
];

export function verifyReplyGrounding(input: GuardInput): GuardVerdict {
  const { reply, result } = input;

  for (const marker of PROMPT_LEAK_MARKERS) {
    if (reply.includes(marker)) return { ok: false, reason: "prompt_leak", detail: marker };
  }

  const amounts = extractMoneyCents(reply);
  if (amounts.length === 0) return { ok: true };

  const forbidden = new Set(result.forbiddenAmountsCents);
  const permitted = new Set<number>([
    ...input.businessPricesCents,
    ...result.allowedAmountsCents,
    ...extractMoneyCents(input.customerMessage),
  ]);

  for (const cents of amounts) {
    if (forbidden.has(cents) && !permitted.has(cents)) {
      return { ok: false, reason: "forbidden_amount", detail: String(cents) };
    }
    if (!permitted.has(cents)) return { ok: false, reason: "ungrounded_amount", detail: String(cents) };
  }
  return { ok: true };
}
