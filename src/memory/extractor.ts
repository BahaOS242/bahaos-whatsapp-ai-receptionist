import type { BusinessContext } from "../ai/types";
import { isClinicalService, isMemoryControlText, normalizeName, screenSentence } from "./policy";
import type { MemoryCandidate } from "./types";

/**
 * Deterministic candidate proposer. Reads ONLY the customer's own message
 * (never AI or staff text). Pure; no I/O; no LLM. Output is still untrusted —
 * everything goes through policy.validateCandidate before storage.
 */

export interface ExtractionResult {
  candidates: MemoryCandidate[];
  /** Sentences the screen refused, by reason code (counts only — never text). */
  screened: Record<string, number>;
}

const NAME_AFTER = String.raw`((?:(?:mr|mrs|ms|miss|mx|dr)\.?\s+)?[\p{L}][\p{L}\p{N}'’-]{0,24}(?:\s+[\p{L}\p{N}][\p{L}\p{N}'’-]{0,24}){0,2})`;
const NAME_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bmy (?:preferred |first |full )?name is\s+${NAME_AFTER}`, "iu"),
  new RegExp(String.raw`\b(?:please |you can )?call me\s+${NAME_AFTER}`, "iu"),
  new RegExp(String.raw`\bthe name(?:'s| is)\s+${NAME_AFTER}`, "iu"),
];
/** "My name isn't Alicia. It's Alisha." — a correction: the NEW name is what counts. */
const NAME_CORRECTION = new RegExp(
  String.raw`\bmy name (?:isn'?t|is not)\s+[\p{L}'’ -]{1,40}?[.,;]?\s*(?:it'?s|it is|but)\s+${NAME_AFTER}`,
  "iu",
);

const LANG_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:i prefer|i'd prefer|i would prefer|please (?:speak|reply|respond|write)(?: to me)?(?: in)?|i (?:speak|want to speak|like to speak)|speak to me in)\b[^.!?]{0,30}\b(spanish|español|espanol)\b/i, "es"],
  [/\b(?:i prefer|i'd prefer|i would prefer|please (?:speak|reply|respond|write)(?: to me)?(?: in)?|i (?:speak|want to speak|like to speak)|speak to me in)\b[^.!?]{0,30}\b(haitian(?: creole)?|creole|kreyòl|kreyol)\b/i, "ht"],
  [/\b(?:i prefer|i'd prefer|i would prefer|please (?:speak|reply|respond|write)(?: to me)?(?: in)?|i (?:speak|want to speak|like to speak)|speak to me in)\b[^.!?]{0,30}\b(english)\b/i, "en"],
];

// Deliberately "prefer"-style only: "I'd like to book in the morning" is a one-off REQUEST, not a durable preference.
const PREFERENCE_LEAD = /\b(?:i (?:usually |always |generally |typically |really )?prefer|i'd (?:usually |always )?prefer|i would (?:usually |always )?prefer|my preference is|works best for me)\b/i;
const TIME_OF_DAY: Array<[RegExp, string]> = [
  [/\bmornings?\b/i, "morning"],
  [/\bafternoons?\b/i, "afternoon"],
  [/\bevenings?\b/i, "evening"],
];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const SCHEDULING_WORD = /\b(appointments?|visits?|bookings?|times?|slots?|schedul\w+|come in)\b/i;
const INTEREST_LEAD = /\b(?:i'?m|i am|i was|i have been|i've been) (?:interested in|looking (?:for|into)|thinking (?:about|of))\b|\binterested in\b/i;

const NAME_CONNECTORS = new Set(["not", "no", "nor", "is", "was", "are", "and", "but", "or", "so", "because", "i", "i'm", "im", "my", "please", "thanks", "thank", "also", "then", "when", "if"]);

/** Cuts a captured name at the first connector word ("Pat and I prefer…" -> "Pat"). */
function cutAtConnector(raw: string): string | null {
  const kept: string[] = [];
  for (const t of raw.trim().split(/\s+/)) {
    if (NAME_CONNECTORS.has(t.toLowerCase().replace(/[.,;:!]+$/, ""))) break;
    kept.push(t);
  }
  return kept.length ? kept.join(" ") : null;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b(mr|mrs|ms|dr|mx)\./gi, "$1§") // an honorific's period does not end a sentence
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replaceAll("§", "."))
    .filter(Boolean)
    .slice(0, 12); // bounded work per message
}

/** Maps free text to a configured service id, or null. */
export function matchServiceId(text: string, business: Pick<BusinessContext, "services">): string | null {
  const lower = text.toLowerCase();
  for (const svc of business.services) {
    const id = String(svc.id);
    const spaced = id.replace(/_/g, " ");
    const nameHead = svc.name.toLowerCase().split("/")[0].trim();
    if (lower.includes(spaced) || lower.includes(nameHead)) return id;
  }
  return null;
}

export function extractCandidates(message: string, business: Pick<BusinessContext, "services">): ExtractionResult {
  const candidates: MemoryCandidate[] = [];
  const screened: Record<string, number> = {};
  const note = (r: string) => (screened[r] = (screened[r] ?? 0) + 1);
  const push = (c: Omit<MemoryCandidate, "source" | "provenance">) =>
    candidates.push({ ...c, source: "customer_stated", provenance: "explicit" });

  const bounded = message.slice(0, 2000).replace(/\s+/g, " ");

  // The customer is managing memory ("forget that I prefer mornings"): learn NOTHING from this message.
  if (isMemoryControlText(bounded)) return { candidates: [], screened: { memory_control: 1 } };

  // "My name isn't Alicia. It's Alisha." spans two sentences, so it is matched on the whole
  // message; the matched span (and only it) is screened, allowing the negation a correction contains.
  const corr = NAME_CORRECTION.exec(bounded);
  if (corr) {
    if (screenSentence(corr[0], { allowNegation: true }).ok) {
      const name = normalizeName(cutAtConnector(corr[1]) ?? "");
      if (name) push({ kind: "preferred_name", slot: "name", value: name, display: name });
      else note("malformed");
    } else note("screened_correction");
  }

  for (const sentence of splitSentences(bounded)) {
    const verdict = screenSentence(sentence);
    if (!verdict.ok) {
      // Only count sentences that LOOKED like a memory statement, to keep the signal meaningful.
      if (looksLikeMemoryStatement(sentence)) note(verdict.reason!);
      continue;
    }

    // "my name is …" may be typed in lower case; "call me …" is only a name when typed as one
    // ("Call me Ally"), otherwise it is an ordinary request ("call me later").
    const nameMatch = NAME_PATTERNS.map((re, i) => {
      const m = re.exec(sentence);
      return m && i === 1 && !/^\p{Lu}/u.test(m[1]) ? null : m;
    }).find(Boolean);
    if (nameMatch) {
      const name = normalizeName(cutAtConnector(nameMatch[1]) ?? "");
      if (name) push({ kind: "preferred_name", slot: "name", value: name, display: name });
      else note("malformed");
    }

    for (const [re, code] of LANG_PATTERNS) {
      if (re.test(sentence)) push({ kind: "preferred_language", slot: "language", value: code });
    }

    if (PREFERENCE_LEAD.test(sentence) && (SCHEDULING_WORD.test(sentence) || TIME_OF_DAY.some(([re]) => re.test(sentence)))) {
      const tods = TIME_OF_DAY.filter(([re]) => re.test(sentence)).map(([, v]) => v);
      if (tods.length === 1) push({ kind: "scheduling_preference", slot: "time_of_day", value: tods[0] });
      else if (tods.length > 1) note("ambiguous");
      const days = WEEKDAYS.filter((d) => new RegExp(`\\b${d}s?\\b`, "i").test(sentence));
      if (days.length === 1) push({ kind: "scheduling_preference", slot: "weekday", value: days[0] });
      else if (days.length > 1) note("ambiguous");
    }

    if (INTEREST_LEAD.test(sentence)) {
      const id = matchServiceId(sentence, business);
      if (id && isClinicalService(`${id} ${business.services.find((s) => String(s.id) === id)?.name ?? ""}`)) note("sensitive");
      else if (id) {
        const svc = business.services.find((s) => String(s.id) === id)!;
        push({ kind: "service_interest", slot: `service:${id}`, value: id, display: svc.name });
      } else note("unconfigured_service");
    }
  }

  // De-duplicate within one message: the last statement per (kind, slot) wins.
  const last = new Map<string, MemoryCandidate>();
  for (const c of candidates) last.set(`${c.kind}|${c.slot}`, c);
  return { candidates: [...last.values()], screened };
}

function looksLikeMemoryStatement(s: string): boolean {
  return (
    NAME_PATTERNS.some((re) => re.test(s)) ||
    NAME_CORRECTION.test(s) ||
    LANG_PATTERNS.some(([re]) => re.test(s)) ||
    PREFERENCE_LEAD.test(s) ||
    INTEREST_LEAD.test(s)
  );
}

/** Slots (`kind|slot`) the current message states explicitly — used so an older memory never overrides them. */
export function slotsStatedIn(message: string, business: Pick<BusinessContext, "services">): Set<string> {
  // Includes statements the policy would refuse to STORE (e.g. a one-off "tomorrow morning"):
  // the customer's current wording still wins over an older preference for this turn.
  const stated = new Set<string>();
  const lower = message.toLowerCase();
  for (const c of extractCandidates(message, business).candidates) stated.add(`${c.kind}|${c.slot}`);
  if (TIME_OF_DAY.some(([re]) => re.test(lower))) stated.add("scheduling_preference|time_of_day");
  if (WEEKDAYS.some((d) => new RegExp(`\\b${d}s?\\b`, "i").test(lower))) stated.add("scheduling_preference|weekday");
  return stated;
}
