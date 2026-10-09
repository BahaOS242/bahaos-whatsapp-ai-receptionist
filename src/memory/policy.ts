import { hasInjectionIndicators } from "../knowledge/injection";
import type { MemoryCandidate, MemoryKind, Validation } from "./types";

/**
 * The gatekeeper. Nothing reaches the database without passing
 * validateCandidate — whoever proposed it (today: the deterministic
 * extractor; tomorrow, possibly an LLM). Pure and synchronous.
 */

export const ALLOWED_KINDS: ReadonlySet<MemoryKind> = new Set([
  "preferred_name",
  "preferred_language",
  "scheduling_preference",
  "service_interest",
  "continuity",
]);

const LANGUAGES: Record<string, string> = { en: "English", es: "Spanish", ht: "Haitian Creole" };
export const ALLOWED_LANGUAGE_CODES = new Set(Object.keys(LANGUAGES));
export const languageLabel = (code: string) => LANGUAGES[code] ?? code;

const TIMES_OF_DAY = new Set(["morning", "afternoon", "evening"]);
const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]);

/** Health, financial and identity terms. A sentence containing any is never promoted to durable memory. */
const SENSITIVE =
  /\b(pain|painful|ache|aching|toothache|swollen|swelling|bleed(?:ing)?|infect(?:ed|ion)|abscess|sore|symptoms?|diagnos\w*|medic(?:ation|ine|al)|prescri\w*|pills?|dose|allerg\w*|pregnan\w*|cancer|chemo\w*|diabet\w*|blood pressure|hiv|surgery|anxiety|depress\w*|therapy|insurance|policy number|ssn|social security|passport|credit card|card number|salary|debt|lawsuit|divorce|religio\w*|disab\w*|illness|sick|disease|condition|hurt(?:s|ing)?|dolor|muela|medicina|medicamento\w*|embaraz\w*|alergi\w*|enfermo|enferma|infecci\w*|sangr\w*|presi|s[ií]ntomas?|doul|gwos|asirans|maladi|medikaman|dan mwen)\b/i;

/** Long digit runs (identity, card, account numbers) never belong in a sentence we learn from. */
const LONG_NUMBER = /\d[\d\s-]{7,}\d/;

const THIRD_PARTY =
  /\b(my|mi|me|his|her|their|our)\s+(wife|husband|spouse|partner|mom|mum|mother|dad|father|son|daughter|kid|kids|child|children|friend|boss|sister|brother|grandm\w+|grandf\w+|aunt|uncle|cousin|neighbou?r|colleague|coworker|patient)\b|\bfor (him|her|them)\b/i;

const HEDGE = /\b(if|wish|hypothetical\w*|suppose|imagine|pretend|maybe|perhaps|i guess|i think|i suppose|might|not sure|unsure|probably|possibly|kind of|sort of|we'll see|depends)\b/i;
const TEMPORARY = /\b(this time|just this once|just once|for now|today|tonight|tomorrow|this (week|weekend|month)|next (week|month)|right now|at the moment|only this)\b/i;
const NEGATION = /\b(don'?t|do not|doesn'?t|never|not|no longer|can'?t|cannot|won'?t|hate|dislike|avoid|isn'?t|wasn'?t)\b/i;
/** The customer is managing what we remember. Never learn from such a sentence. */
const MEMORY_CONTROL =
  /\b(forget|erase|delete|remove|clear|wipe|purge|don'?t (?:you )?(?:remember|save|store|keep|record|track)|do not (?:remember|save|store|keep|record|track)|stop (?:remembering|saving|storing|recording|tracking|keeping)|no longer|not anymore|anymore|never ?mind|ignore that|disregard that)\b/i;
export const isMemoryControlText = (text: string) => MEMORY_CONTROL.test(text);

const QUESTION_START = /^\s*(can|could|would|will|do|does|did|is|are|what|when|where|how|why|who|which|may|should)\b/i;

export interface SentenceVerdict {
  ok: boolean;
  reason?: "memory_control" | "sensitive" | "third_party" | "hedged" | "temporary" | "question" | "injection";
}

/** Sentence-level screen applied BEFORE any pattern is allowed to propose a value. */
export function screenSentence(sentence: string, opts: { allowNegation?: boolean } = {}): SentenceVerdict {
  const s = sentence.trim();
  if (!s) return { ok: false, reason: "question" };
  if (s.endsWith("?") || QUESTION_START.test(s)) return { ok: false, reason: "question" };
  if (hasInjectionIndicators(s)) return { ok: false, reason: "injection" };
  if (MEMORY_CONTROL.test(s)) return { ok: false, reason: "memory_control" };
  if (SENSITIVE.test(s) || LONG_NUMBER.test(s)) return { ok: false, reason: "sensitive" };
  if (THIRD_PARTY.test(s)) return { ok: false, reason: "third_party" };
  if (HEDGE.test(s)) return { ok: false, reason: "hedged" };
  if (TEMPORARY.test(s)) return { ok: false, reason: "temporary" };
  if (!opts.allowNegation && NEGATION.test(s)) return { ok: false, reason: "hedged" };
  return { ok: true };
}

const NAME_STOP = new Set([
  "not", "here", "sure", "calling", "the", "a", "an", "and", "or", "fine", "good", "okay", "ok", "yes", "no", "sorry",
  "interested", "looking", "wondering", "trying", "just", "also", "from", "with", "for", "to", "at", "in", "on", "me", "you",
  "tired", "busy", "late", "ready", "new", "back", "free", "available", "unknown", "anonymous", "customer", "patient", "admin",
  "assistant", "system", "receptionist", "bot", "ai", "later", "asap", "now", "soon", "again", "anytime", "whenever", "instead",
  "directly", "today", "tonight", "please", "thanks", "number", "phone", "text", "message", "tomorrow", "morning", "afternoon", "evening",
]);
const NAME_TOKEN = /^[\p{L}][\p{L}'’-]{0,24}$/u;
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr"]);

/** Returns a normalized display name, or null if it is not a plausible name. */
export function normalizeName(raw: string): string | null {
  const tokens = raw.trim().replace(/[.,;:!]+$/g, "").split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return null;
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/\.$/, "");
    const lower = t.toLowerCase();
    if (i === 0 && HONORIFICS.has(lower)) {
      out.push(lower === "mx" ? "Mx." : lower.charAt(0).toUpperCase() + lower.slice(1) + (lower === "miss" ? "" : "."));
      continue;
    }
    if (!NAME_TOKEN.test(t) || NAME_STOP.has(lower)) return null;
    out.push(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase().replace(/(['’-])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase()));
  }
  if (out.length === 1 && out[0].endsWith(".")) return null; // honorific alone
  return out.join(" ");
}

/** Control characters and markup/JSON-ish delimiters never belong in a stored fact. */
function hasForbiddenChars(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 32 || code === 127 || "<>{}[]".includes(ch)) return true;
  }
  return false;
}

/** Procedures that imply a condition: never promoted to durable memory (consultation, cleaning, cosmetic are fine). */
const CLINICAL_SERVICE = /root[ _-]?canal|fill(?:ing|ings)?|extract\w*|crown|implant|brace\w*|denture\w*|abscess|surg\w*|bridge|veneer\w*|cavit\w*|gum|periodon\w*|orthodon\w*|wisdom|emergency/i;
export const isClinicalService = (text: string) => CLINICAL_SERVICE.test(text);

const SLOT_RE = /^[a-z_]+(:[a-z0-9_]+)?$/;

/** The single gate. */
export function validateCandidate(c: MemoryCandidate): Validation {
  if (!c || typeof c !== "object") return { ok: false, reason: "malformed" };
  if (!ALLOWED_KINDS.has(c.kind)) return { ok: false, reason: "kind_not_allowed" };
  if (c.provenance !== "explicit") return { ok: false, reason: "inferred" };
  if (c.source !== "customer_stated" && c.source !== "staff_entered" && c.source !== "system_derived") {
    return { ok: false, reason: "bad_source" };
  }
  if (typeof c.value !== "string" || typeof c.slot !== "string" || !SLOT_RE.test(c.slot) || c.slot.length > 80) {
    return { ok: false, reason: "malformed" };
  }
  const value = c.value.trim();
  const display = (c.display ?? value).trim();
  if (!value || value.length > 120 || display.length > 120) return { ok: false, reason: "malformed" };
  if (hasForbiddenChars(value + display)) return { ok: false, reason: "malformed" };
  if (hasInjectionIndicators(value) || hasInjectionIndicators(display)) return { ok: false, reason: "injection" };
  if (SENSITIVE.test(value) || SENSITIVE.test(display)) return { ok: false, reason: "sensitive" };

  switch (c.kind) {
    case "preferred_name": {
      if (c.slot !== "name") return { ok: false, reason: "malformed" };
      const n = normalizeName(value);
      if (!n) return { ok: false, reason: "malformed" };
      return { ok: true, candidate: { ...c, value: n, display: n } };
    }
    case "preferred_language":
      if (c.slot !== "language" || !ALLOWED_LANGUAGE_CODES.has(value)) return { ok: false, reason: "malformed" };
      return { ok: true, candidate: { ...c, value, display: languageLabel(value) } };
    case "scheduling_preference":
      if (c.slot === "time_of_day" && TIMES_OF_DAY.has(value)) return { ok: true, candidate: { ...c, value, display: value } };
      if (c.slot === "weekday" && WEEKDAYS.has(value)) return { ok: true, candidate: { ...c, value, display: value } };
      return { ok: false, reason: "malformed" };
    case "service_interest":
      if (!/^service:[a-z0-9_]+$/.test(c.slot) || c.slot !== `service:${value}`) return { ok: false, reason: "malformed" };
      if (isClinicalService(`${c.slot} ${display}`)) return { ok: false, reason: "sensitive" };
      return { ok: true, candidate: { ...c, value, display: c.display?.trim() || value } };
    case "continuity":
      if (c.source !== "system_derived") return { ok: false, reason: "bad_source" };
      if (!c.ttlSeconds || c.ttlSeconds <= 0) return { ok: false, reason: "malformed" }; // continuity MUST expire
      if (c.slot === "requested_human" && value === "yes") return { ok: true, candidate: { ...c, display: "asked to speak with a person" } };
      if (/^inquiry:[a-z0-9_]+$/.test(c.slot) && isClinicalService(`${c.slot} ${display}`)) return { ok: false, reason: "sensitive" };
      if (/^inquiry:[a-z0-9_]+$/.test(c.slot) && c.slot === `inquiry:${value}`) return { ok: true, candidate: { ...c, display: c.display?.trim() || value } };
      return { ok: false, reason: "malformed" };
  }
}

export interface MemoryControl {
  /** Kinds to remove; "all" removes every active memory of this customer. */
  scope: "all" | MemoryKind[];
}

const CONTROL_ALL = /\b(stop (?:remembering|saving|storing|recording|tracking|keeping)|forget (?:everything|all|me|about me)|delete (?:everything|all|what you know|what you have|my (?:data|info|information|details|profile|records?))|erase (?:everything|all|what you know|my (?:data|info|information|details|profile))|clear (?:everything|all|what you know|my (?:data|info|information|details|profile))|(?:don'?t|do not) (?:remember|save|store|keep|record|track) (?:anything|things|stuff|any)|wipe (?:everything|my))\b/i;
const CONTROL_VERB = /\b(forget|(?:don'?t|do not) (?:you )?(?:remember|save|store|keep|record)|delete what|erase what|remove what)\b/i;
/** "…not my preference anymore": a retraction only when it is about a PREFERENCE. "I no longer need Tuesday" is not. */
const RETRACTION = /\b(no longer|not anymore|anymore)\b/i;
const PREFERENCE_WORD = /\bprefer\w*\b/i;

/**
 * Is the customer managing what we remember? Deliberately narrow: "remove my
 * appointment" is NOT a memory request. When the target is unclear we fail
 * toward forgetting MORE (the customer can simply restate a preference).
 */
export function detectMemoryControl(message: string): MemoryControl | null {
  const text = message.slice(0, 2000);
  if (CONTROL_ALL.test(text)) return { scope: "all" };
  if (!CONTROL_VERB.test(text) && !(RETRACTION.test(text) && PREFERENCE_WORD.test(text))) return null;
  const kinds = new Set<MemoryKind>();
  if (/\bname\b/i.test(text)) kinds.add("preferred_name");
  if (/\b(language|spanish|english|creole|español|espanol)\b/i.test(text)) kinds.add("preferred_language");
  if (/\b(morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|appointments?|schedul\w*|prefer\w*|time)s?\b/i.test(text)) kinds.add("scheduling_preference");
  if (/\b(interest\w*|service)\b/i.test(text)) kinds.add("service_interest");
  return { scope: kinds.size ? [...kinds] : "all" };
}

export const MEMORY_CONTROL_NOTICE = [
  "PRIVACY REQUEST: the customer asked you to forget, or stop using, details remembered about them.",
  "The system has removed the remembered profile details they referred to and will not use them.",
  "You cannot erase conversation history, appointments or business records from this chat. Do not claim that everything was deleted or erased.",
  "Reply briefly: confirm the request was noted and those remembered details will no longer be used, and offer that a team member can help with anything further. Never repeat the details back.",
];
