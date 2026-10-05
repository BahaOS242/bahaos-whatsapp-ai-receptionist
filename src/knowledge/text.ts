import { createHash } from "node:crypto";

/**
 * Text analysis shared by ingestion, retrieval and the query gate. Pure
 * and deterministic: the same input always yields the same terms, which is
 * what lets retrieval thresholds be measured rather than guessed.
 */

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Strips control characters (keeps \n and \t), normalizes line endings
 * and collapses runs of spaces. Does NOT change wording. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const STOPWORDS = new Set(
  (
    "a an the and or but if then else of at by for with about as into like through after over between out " +
    "against during without before under around among to from up down in on off is are was were be been being " +
    "am do does did doing have has had having i me my mine we us our you your yours he she it its they them " +
    "their this that these those there here what which who whom whose when where why how can could would " +
    "should will shall may might must also just so than too very really any some all each every more most " +
    "other such only own same not no nor yes ok okay please pls thanks thank hi hello hey get got let lets " +
    "go going know tell say ask want need wanted wondering curious quick quickly bit little lot much many " +
    "still yet already even ever never always actually basically maybe perhaps anyway well oh um uh " +
    "whats hows wheres whos thats theres its ill ive dont doesnt didnt cant wont isnt arent im youre " +
    "id youd weve theyre lets whatre along"
  ).split(/\s+/),
);

/**
 * Words that are grammatical in a question but carry no business topic.
 * Kept SEPARATE from stopwords so the gate and the coverage score can both
 * say "this word tells us nothing about WHAT is being asked".
 */
const GENERIC = new Set(
  (
    "offer offers offered take takes taking give gives provide provides help helps able available " +
    "possible thing things stuff question questions info information detail details office clinic practice " +
    "dental someone anyone guys folks place business service services thing " +
    "come coming see visit look looking find new old good great best nice sure right today now " +
    "happen happens happened happening time times work works accept accepts accepted accepting appointment appointments"
  ).split(/\s+/),
);

/** Domain synonym groups. Every member canonicalizes to the first word. A
 * deliberately SMALL, reviewed list: each group is a claim that the words
 * are interchangeable for retrieval purposes. */
const SYNONYM_GROUPS: string[][] = [
  ["price", "prices", "pricing", "cost", "costs", "fee", "fees", "charge", "charges", "rate", "rates", "expensive", "cheap", "afford", "affordable", "quote"],
  ["insurance", "insure", "insured", "insurer", "coverage", "cover", "covered", "covers", "nib", "colina", "claim", "claims", "reimbursement"],
  ["cancel", "cancels", "cancelled", "canceled", "cancelling", "canceling", "cancellation", "cancellations"],
  ["refund", "refunds", "refunded", "reimburse"],
  ["payment", "pay", "paying", "paid", "cash", "card", "cards", "credit", "debit", "visa", "mastercard", "cheque", "financing", "installment", "installments"],
  ["hours", "hour", "open", "opens", "opening", "close", "closes", "closing", "closed"],
  ["location", "located", "address", "directions", "map", "street"],
  ["parking", "park", "parked"],
  ["bring", "brings", "bringing", "brought", "require", "required", "requires", "requirement", "requirements", "prepare", "preparation", "documents", "document"],
  ["arrive", "arrives", "arrival", "arriving", "early", "earlier", "ahead"],
  ["duration", "long", "length", "minutes", "minute", "mins", "min", "lasts", "last"],
  ["pediatric", "paediatric", "child", "children", "kid", "kids", "minor", "toddler"],
  ["whitening", "whiten", "whiter", "bleaching", "bleach"],
  ["emergency", "urgent", "urgently"],
  ["promotion", "promotions", "promo", "promos", "discount", "discounts", "special", "specials", "offer-deal", "deal", "deals", "coupon"],
  ["dentist", "doctor", "dr", "practitioner"],
  ["wait", "waiting", "late", "delay", "delayed"],
];

function suffixStem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && w.length > 3) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 5 && w.endsWith("ation")) w = w.slice(0, -5);
  if (w.length > 4 && w.endsWith("ly")) w = w.slice(0, -2);
  return w;
}

const CANON = new Map<string, string>([["hrunit", "duration"]]);
for (const group of SYNONYM_GROUPS) {
  const head = group[0];
  for (const member of group) {
    CANON.set(member, head);
    CANON.set(suffixStem(member), head);
  }
}

/** One surface word -> its canonical retrieval term. */
export function canonicalTerm(word: string): string {
  const w = word.toLowerCase();
  return CANON.get(w) ?? CANON.get(suffixStem(w)) ?? suffixStem(w);
}

/** Lowercase word tokens; keeps digits (so "24" survives) and drops
 * punctuation. "how much" is rewritten to "price" first, since neither
 * word alone means anything. */
export function tokenize(text: string): string[] {
  const lowered = text
    .toLowerCase()
    // "2 hours" / "24 hrs" is a DURATION, not the business's opening
    // hours — keep the two from colliding on the word "hours".
    .replace(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/g, "$1 hrunit")
    .replace(/\bhow much\b/g, " price ")
    .replace(/\bwhat'?s the (cost|price)\b/g, " price ")
    .replace(/[’']/g, "");
  return lowered.match(/[a-z0-9]+/g) ?? [];
}

/** Canonical, de-duplicated INFORMATIVE terms of `text` — what retrieval
 * coverage is computed over. Stopwords and generic question filler are
 * removed. */
export function contentTerms(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of tokenize(text)) {
    if (STOPWORDS.has(token) || GENERIC.has(token)) continue;
    if (token.length < 2 && !/\d/.test(token)) continue;
    const term = canonicalTerm(token);
    if (seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return out;
}

/** Every canonical token (stopwords removed, duplicates kept, order kept)
 * — the input to the hashing embedder, which wants frequency and
 * adjacency. */
export function embeddingTokens(text: string): string[] {
  return tokenize(text)
    .filter((t) => !STOPWORDS.has(t))
    .map(canonicalTerm);
}

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token.toLowerCase());
}
