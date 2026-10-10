import { trimNameAtBoundary } from "./correction-language";

/**
 * Name provenance: a string only becomes a patient name when the application
 * can say WHY it is one.
 *
 *   1. Explicit introduction  — "my name is X", "name is X", "call me X",
 *      "put it under X", "it's for my wife, X", and (only with capitalised
 *      tokens, because they are ambiguous) "I'm X", "this is X", "it's X".
 *   2. Bare answer           — the customer was just asked for a name and
 *      replied with a short, name-shaped phrase that contains no question,
 *      acknowledgment, schedule word, service word or filler.
 *
 * Questions ("How long will it take?"), acknowledgments ("Yes", "Please",
 * "That is perfect"), fragments of ordinary sentences ("For my", "I'd like")
 * and schedule/service words are never names. Legitimate multiword,
 * hyphenated and apostrophe-containing names are preserved with their
 * capitalisation. When a phrase is not clearly a name the caller keeps asking
 * (the field stays unset) rather than guessing.
 */

const APOS = "['’]";
/** One name token: letters with internal hyphens/apostrophes (O'Brien, Mary-Jane). */
const TOKEN_SRC = `[A-Za-z](?:[A-Za-z]|${APOS}(?=[A-Za-z])|-(?=[A-Za-z]))*`;
const TOKEN_RE = new RegExp(`^${TOKEN_SRC}$`);

const NOT_NAME_WORDS = new Set(
  `a an the and or but so if then than that this these those there here it its it's i i'm im i'd id i'll ive i've me my mine we our you your yours he she they them his her
   is am are was were be been being do does did done doing have has had having can could would should shall might must
   yes yeah yep yup ya no nope nah ok okay k sure fine perfect great good nice cool alright sounds works work right correct wrong
   please thanks thank thx hello hi hey hiya morning afternoon evening night today tonight tomorrow tmrw yesterday week weekend next last later earlier early late soon sooner now
   how what when where why who whom whose which whats what's hows how's
   for about with without from to into on at by in of off up out over under before after around between until till
   try also just maybe actually instead really very too much many more most any anything some something other another else
   long short time day days date hour hours minute minutes appointment appointments booking book schedule visit
   monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun
   january february march july september october november december
   cleaning filling consultation exam checkup check root canal service services price cost fee parking insurance
   want need like think know guess mean see tell ask help get got make come go going let lets let's
   not dont don't doesnt doesn't cant can't wont won't never nothing none nobody
   well oh um uh hmm hm anyway anyhow wow haha lol ugh
   am pm`
    .split(/\s+/)
    .filter(Boolean),
);

const lower = (s: string) => s.toLowerCase().replace(/’/g, "'");
const isStop = (w: string) => NOT_NAME_WORDS.has(lower(w));

/** Words whose misspellings must never be mistaken for a name ("Tuesdya", "Thrusday", "cleanign"). */
const GUARDED_WORDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "tomorrow",
  "tonight",
  "morning",
  "afternoon",
  "evening",
  "cleaning",
  "filling",
  "consultation",
  "appointment",
  "checkup",
  "canal",
  "september",
  "october",
  "november",
  "december",
  "january",
  "february",
];

/** Optimal-string-alignment distance (insert/delete/substitute/transpose). */
function osa(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** A token that is a typo of a weekday/month/service/time word. */
function isScheduleTypoOrAbbreviation(tok: string): boolean {
  const t = tok.toLowerCase();
  return GUARDED_WORDS.some((w) => osa(t, w) <= (w.length >= 8 ? 2 : 1));
}

/** "Mary-jane o'brien" -> "Mary-Jane O'Brien"; tokens with their own internal capitals (McDonald) are kept as typed. */
export function formatName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((tok) => {
      if (/[A-Z]/.test(tok.slice(1))) return tok;
      return tok
        .toLowerCase()
        .replace(/(^|-|['’])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join(" ");
}

function takeNameTokens(
  text: string,
  opts: { requireCapital: boolean; max?: number },
): string | undefined {
  // Skip leading emphasis ("my name is ACTUALLY Trevon") and cut at boundary words ("... Sarah and my number is").
  const words = trimNameAtBoundary(text.split(/[,.;:!?]/)[0]).split(/\s+/); // a name never spans a comma
  const kept: string[] = [];
  for (const raw of words) {
    const endsClause = /[,.:;!]$/.test(raw);
    const w = raw.replace(/^[,.:;"()]+|[,.:;!"()]+$/g, "");
    if (!w || !TOKEN_RE.test(w) || isStop(w) || isScheduleTypoOrAbbreviation(w)) break;
    if (opts.requireCapital && !/^[A-Z]/.test(w)) break;
    kept.push(w);
    if (kept.length >= (opts.max ?? 4) || endsClause) break;
  }
  if (kept.length === 1 && /^[A-Z]{2,3}$/.test(kept[0])) return undefined; // lone abbreviation ("XL"), not a name
  return kept.length ? formatName(kept.join(" ")) : undefined;
}

const RELATIVE =
  "(?:wife|husband|son|daughter|mother|mom|mum|father|dad|friend|sister|brother|cousin|partner|boyfriend|girlfriend|grandmother|grandfather|aunt|uncle|child|kid)";

/**
 * Patterns that carry their own provenance.
 * - `explicit`: an unambiguous identity statement; may replace a stored name.
 * - `onlyWhenAsked`: ambiguous phrasing ("I'm done", "it's fine") that is trusted only while the
 *   application is actually asking for the name.
 * - `requireCapital`: the tokens must be capitalised as typed (guards "it's perfect", "I'm out").
 */
const INTRODUCTIONS: {
  re: RegExp;
  explicit: boolean;
  onlyWhenAsked: boolean;
  requireCapital: boolean;
}[] = [
  {
    re: /\bmy name(?:'s| is)\s+(.+)$/i,
    explicit: true,
    onlyWhenAsked: false,
    requireCapital: false,
  },
  {
    re: /\b(?:the )?(?:patient(?:'s)? name(?: is)?|name(?:'s| is))\s+(.+)$/i,
    explicit: true,
    onlyWhenAsked: false,
    requireCapital: false,
  },
  { re: /\bcall me\s+(.+)$/i, explicit: true, onlyWhenAsked: false, requireCapital: false },
  {
    re: /\bput (?:it|that|this|the appointment|the booking) (?:down )?(?:under|for)\s+(?:the name\s+)?(.+)$/i,
    explicit: true,
    onlyWhenAsked: false,
    requireCapital: false,
  },
  { re: /\bunder the name\s+(.+)$/i, explicit: true, onlyWhenAsked: false, requireCapital: false },
  {
    re: new RegExp(
      `\\b(?:it'?s |this is |booking |appointment )?for my ${RELATIVE}\\b[,:]?\\s*(?:(?:named|called|is|name is)\\s+)?(.+)$`,
      "i",
    ),
    explicit: false,
    onlyWhenAsked: false,
    requireCapital: true,
  },
  {
    re: /\b(?:i am|i'?m|im|this is|it'?s|its)\s+(.+)$/i,
    explicit: false,
    onlyWhenAsked: true,
    requireCapital: true,
  },
];

export interface IntroducedName {
  name: string;
  /** Unambiguous identity statement — may replace a previously stored name. */
  explicit: boolean;
}

/** A name stated with explicit provenance, or undefined. */
export function extractIntroducedName(
  message: string,
  opts: { nameAsked: boolean; phoneInMessage?: boolean },
): IntroducedName | undefined {
  const text = message
    .replace(/\+?\d[\d\s().-]{5,}\d/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /[?]/.test(text)) return undefined;
  for (const { re, explicit, onlyWhenAsked, requireCapital } of INTRODUCTIONS) {
    // "I'm Michael Gibson, 242-555-0137": a phone number given alongside makes "I'm X" an introduction.
    if (onlyWhenAsked && !opts.nameAsked && !opts.phoneInMessage) continue;
    const m = text.match(re);
    if (!m) continue;
    const name = takeNameTokens(m[1], { requireCapital });
    if (name) return { name, explicit };
  }
  return undefined;
}

/**
 * Is `remainder` (the message minus phone, date/time text and correction
 * wording) plausibly the answer to "what's your name?"
 */
/** Ordinary words that are also common surnames/given names; accepted only AFTER a first name word and only when
 * capitalised as typed, in a context that is already about identity (name asked / phone given). */
const SOFT_NAME_WORDS = new Set(["day", "long", "short", "early", "late", "good", "best", "hope", "love", "will", "may", "june", "april", "august", "rose", "bell", "king", "young"]);

export function isPlausibleBareName(remainder: string, original: string, contextual = false): boolean {
  if (/[?]/.test(original)) return false; // a question is never a name
  const cleaned = remainder
    .replace(/[,.!;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return false;
  const words = cleaned.split(" ");
  if (words.length > 4) return false;
  if (words.length === 1 && /^[A-Z]{2,3}$/.test(words[0])) return false; // lone abbreviation ("XL"), not a name
  return words.every((w, i) => {
    if (!TOKEN_RE.test(w) || isScheduleTypoOrAbbreviation(w)) return false;
    if (!isStop(w)) return true;
    return contextual && i > 0 && /^[A-Z]/.test(w) && SOFT_NAME_WORDS.has(w.toLowerCase());
  });
}

/** Formats an accepted bare answer (call only after isPlausibleBareName). */
export function bareNameValue(remainder: string): string {
  return formatName(
    remainder
      .replace(/[,.!;:]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}
