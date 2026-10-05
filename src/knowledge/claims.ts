import type { KnowledgeClaim } from "./types";

/**
 * Deterministic claim extraction — the basis of conflict detection.
 *
 * Deliberately CONSERVATIVE: a claim is emitted only when a sentence
 * unambiguously ties one known subject to one value. Missing a claim means
 * a conflict is not auto-detected (the retrieval itself still works);
 * emitting a WRONG claim means a false conflict that makes the receptionist
 * refuse a correct answer. Precision beats recall here, on purpose.
 *
 * Currency: amounts are compared numerically ("$100" == "B$100" == "100
 * BSD"). The Bahamian dollar is pegged 1:1 to USD, which is why this is
 * safe for this product; a tenant in a non-pegged currency would need a
 * currency field on the claim (documented limitation).
 */

export interface ClaimSubject {
  /** Stable id, e.g. "root_canal" -> subject "service:root_canal". */
  id: string;
  /** Every name the subject can appear under, e.g. ["root canal", "root canals"]. */
  names: string[];
}

// A FRESH regex per use: a shared /g regex carries `lastIndex` between
// calls (and String.matchAll clones it, lastIndex included), which silently
// skips matches after any earlier exec().
const moneyRe = () =>
  /(?:b\$|bsd\s?|\$)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars|bsd)\b/gi;

/** Wording that makes an amount about something OTHER than the service's
 * price (a deposit, a discount, a penalty...). Any of these in the
 * sentence suppresses the price claim. */
const NON_PRICE_CONTEXT_RE =
  /\b(deposit|late fee|cancellation fee|no-?show|penalty|discount|off\b|save|saving|down payment|per month|monthly|insurance (covers|pays)|copay|co-pay|up to|starting|from \$|starts)\b/i;

const DURATION_RE = /(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/gi;
const DURATION_CUE_RE = /\b(takes?|lasts?|duration|approximately|about|around|appointment length)\b/i;
const NOT_DURATION_CONTEXT_RE = /\b(cancel\w*|notice|before|prior|in advance|advance|early|ahead|within|less than|at least|wait)\b/i;

export function parseMoneyCents(text: string): number | undefined {
  const m = moneyRe().exec(text);
  if (!m) return undefined;
  const raw = (m[1] ?? m[2]).replace(/,/g, "");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

/** Every money amount in `text`, in cents, in order of appearance. */
export function extractMoneyCents(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(moneyRe())) {
    const raw = (m[1] ?? m[2]).replace(/,/g, "");
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) out.push(Math.round(n * 100));
  }
  return out;
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|;\s+|\s•\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Mention {
  subject: ClaimSubject;
  index: number;
}

function findMentions(sentence: string, subjects: ClaimSubject[]): Mention[] {
  const lower = sentence.toLowerCase();
  const found: Mention[] = [];
  const claimedRanges: Array<[number, number]> = [];
  // Longest names first so "root canal" wins over a hypothetical "canal".
  const candidates = subjects
    .flatMap((subject) => subject.names.map((name) => ({ subject, name: name.toLowerCase() })))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { subject, name } of candidates) {
    const re = new RegExp(`\\b${escapeRe(name)}\\b`, "g");
    for (const m of lower.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + name.length;
      if (claimedRanges.some(([s, e]) => start < e && end > s)) continue;
      claimedRanges.push([start, end]);
      if (!found.some((f) => f.subject.id === subject.id)) found.push({ subject, index: start });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * Extracts price, duration and cancellation-notice claims from `text`.
 * Policy notice has a single fixed subject ("policy:cancellation").
 */
export function extractClaims(text: string, subjects: ClaimSubject[]): KnowledgeClaim[] {
  const claims: KnowledgeClaim[] = [];
  const seen = new Set<string>();
  const push = (claim: KnowledgeClaim) => {
    const key = `${claim.subject}|${claim.attribute}|${claim.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      claims.push(claim);
    }
  };

  for (const sentence of splitSentences(text)) {
    const mentions = findMentions(sentence, subjects);

    // --- price ---
    if (mentions.length > 0 && !NON_PRICE_CONTEXT_RE.test(sentence)) {
      const amounts = [...sentence.matchAll(moneyRe())].map((m) => ({
        cents: Math.round(Number.parseFloat((m[1] ?? m[2]).replace(/,/g, "")) * 100),
        display: m[0].trim(),
        index: m.index ?? 0,
      }));
      if (amounts.length === 1 && mentions.length === 1) {
        push({
          subject: `service:${mentions[0].subject.id}`,
          attribute: "price",
          value: String(amounts[0].cents),
          display: formatCents(amounts[0].cents),
        });
      } else if (amounts.length > 1 && amounts.length === mentions.length) {
        // "Cleaning $125, filling $175" — pair by order of appearance.
        mentions.forEach((mention, i) => {
          push({
            subject: `service:${mention.subject.id}`,
            attribute: "price",
            value: String(amounts[i].cents),
            display: formatCents(amounts[i].cents),
          });
        });
      }
    }

    // --- duration ---
    if (
      mentions.length === 1 &&
      DURATION_CUE_RE.test(sentence) &&
      !NOT_DURATION_CONTEXT_RE.test(sentence)
    ) {
      const durations = [...sentence.matchAll(DURATION_RE)];
      if (durations.length === 1) {
        const n = Number.parseFloat(durations[0][1]);
        const unit = durations[0][2].toLowerCase();
        const minutes = Math.round(unit.startsWith("h") ? n * 60 : n);
        push({
          subject: `service:${mentions[0].subject.id}`,
          attribute: "duration",
          value: String(minutes),
          display: `${minutes} minutes`,
        });
      }
    }

    // --- cancellation notice ---
    if (/\bcancel\w*/i.test(sentence)) {
      const hours = [...sentence.matchAll(/(\d+)\s*(?:-|\s)?\s*hours?/gi)];
      if (hours.length === 1 && /\b(before|prior|notice|in advance|ahead|less than|within|at least|up to)\b/i.test(sentence)) {
        const h = Number.parseInt(hours[0][1], 10);
        push({
          subject: "policy:cancellation",
          attribute: "notice_hours",
          value: String(h),
          display: `${h} hours`,
        });
      }
    }
  }
  return claims;
}
