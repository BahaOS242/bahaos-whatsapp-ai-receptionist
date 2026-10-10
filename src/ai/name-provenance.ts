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
   am pm`
    .split(/\s+/)
    .filter(Boolean),
);

const lower = (s: string) => s.toLowerCase().replace(/’/g, "'");
const isStop = (w: string) => NOT_NAME_WORDS.has(lower(w));

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
    if (!w || !TOKEN_RE.test(w) || isStop(w)) break;
    if (opts.requireCapital && !/^[A-Z]/.test(w)) break;
    kept.push(w);
    if (kept.length >= (opts.max ?? 4) || endsClause) break;
  }
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
  opts: { nameAsked: boolean },
): IntroducedName | undefined {
  const text = message
    .replace(/\+?\d[\d\s().-]{5,}\d/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /[?]/.test(text)) return undefined;
  for (const { re, explicit, onlyWhenAsked, requireCapital } of INTRODUCTIONS) {
    if (onlyWhenAsked && !opts.nameAsked) continue;
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
export function isPlausibleBareName(remainder: string, original: string): boolean {
  if (/[?]/.test(original)) return false; // a question is never a name
  const cleaned = remainder
    .replace(/[,.!;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return false;
  const words = cleaned.split(" ");
  if (words.length > 4) return false;
  return words.every((w) => TOKEN_RE.test(w) && !isStop(w));
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
