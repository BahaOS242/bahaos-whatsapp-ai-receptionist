import {
  isIsoDateString,
  parseBareHour,
  parseTime,
  resolveDateWord,
  weekdayForIsoDate,
} from "./date-time";
import type { BookingState } from "./types";

/**
 * Which date/time mention in a message is the customer's PROPOSAL?
 *
 * A single message can mention several days/times with different roles:
 *   "Next Thursday is too far, what about Tuesday 11am?"   (rejects one, proposes one)
 *   "I have a meeting at 10am. What about earlier? Wednesday 9am?"
 *   "I need it done before Wednesday"                      (a deadline, not a day)
 *   "my schedule is busy on Thursday"                      (a rejection, no proposal)
 * Reading the first mention books the wrong slot. This module separates the roles:
 *  - mentions inside a rejection clause are never proposals;
 *  - a rejection that matches a STORED value (or says "too early/late/far") clears
 *    exactly that stored value so a stale approval cannot survive;
 *  - deadline phrases ("before/by/until Wednesday") are not days.
 * With no rejection or deadline in the message the text is returned unchanged,
 * so ordinary "Tuesday, 2pm" handling is untouched.
 */
export interface ScheduleAnalysis {
  /** Text the date/time parsers should read instead of the raw message. */
  proposalText: string;
  /** The message rejected the currently stored day / time. */
  clearDate: boolean;
  clearTime: boolean;
  /** At least one clause rejected something: the rest of the message is a correction. */
  hadRejection: boolean;
  /** The message PROPOSES a day/time ("I'd like 10am then", "Friday 9:00 is fine"): it may replace a stored one. */
  hasProposalCue: boolean;
  /** "I'm off that day" without a verdict: availability vs rejection is unclear — the app must ask. */
  ambiguousAvailability: boolean;
}

const WEEKDAY =
  "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const DEADLINE_RE = new RegExp(
  `\\b(?:before|by|until|till|no later than)\\s+(?:next\\s+)?${WEEKDAY}\\b`,
  "gi",
);
const MENTION_RE = new RegExp(
  `\\b${WEEKDAY}\\b|\\b(?:today|tomorrow|tmrw|tonight)\\b|\\b\\d{1,2}(?::\\d{2})?\\s?(?:[ap]\\.?m\\.?)(?!\\w)|\\b\\d{1,2}:\\d{2}\\b|\\bnoon\\b|\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}\\b`,
  "i",
);
/** Hard rejections: the customer cannot / does not want the day or time being discussed. */
const HARD_REJECT_RE =
  /\b(too (?:early|late|far|soon)|won'?t work|doesn'?t work|does not work|don'?t work|can'?t (?:do|make|come|go|be there)|cannot|can not|not (?:good|available|possible|free|then|that day)|no good|unavailable|busy|meeting|conflict|brunch|appointment elsewhere|have (?:a|an|to) (?:game|class|work|shift|exam|event)|(?:i'?m|i am) (?:working|at work)|i work)\b/i;

/** AVAILABILITY, not rejection: being off work / free / "that works" means the day is GOOD. */
const AVAILABLE_RE =
  /\b(?:(?:i'?m|i am|am|i'?ll be|i will be) (?:off|free|available|open)|my day off|day off|off (?:work|then)|(?:that|it|this|tuesday|monday|wednesday|thursday|friday) works|works (?:for me|fine)|(?:is|are) (?:fine|good|ok|okay)|i can (?:do|make) (?:it|that|that day))\b/i;

/** "tuesday i off that day" (no "'m"/"am", no verdict): could mean free OR unavailable — ask, never guess. */
const AMBIGUOUS_OFF_RE = /\b(?:i off|off that day|off on that day)\b/i;

type ClauseKind = "reject" | "available" | "ambiguous" | "neutral";
function classify(clause: string): ClauseKind {
  if (HARD_REJECT_RE.test(clause)) return "reject";
  if (AVAILABLE_RE.test(clause)) return "available";
  if (AMBIGUOUS_OFF_RE.test(clause)) return "ambiguous";
  return "neutral";
}

const PROPOSAL_CUE_RE =
  /\b(i'?d like|i would like|i want|let'?s|can (?:we|i) (?:do|come|go|have|make)|could (?:we|i) (?:do|come|go|have|make)|how about|what about|go with|go for|try|book|schedule|reserve|put me (?:down )?(?:for|on)|set it (?:for|to)|is fine|is good|works(?: for me)?|will work|would work|sounds good|then)\b/i;

const norm = (s: string) => s.replace(/\b([ap])\.m\.?/gi, "$1m");

function clauses(text: string): string[] {
  return text
    .split(/(?<=[.?!;])\s+|,\s*|\s+but\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

const dayName = (v: string) => (isIsoDateString(v) ? weekdayForIsoDate(v) : v);

function sameBare(clause: string, stored: string): boolean {
  const bare = parseBareHour(clause);
  const [h, m] = stored.split(":").map(Number);
  if (bare) return bare.hour % 12 === h % 12 && bare.minute === m;
  const t = parseTime(clause);
  return t === stored;
}

export function analyzeScheduleMessage(
  message: string,
  stored: Pick<BookingState, "date" | "time">,
): ScheduleAnalysis {
  const text = norm(message).replace(DEADLINE_RE, " ");
  const parts = clauses(text);
  const rejected = parts.filter((c) => classify(c) === "reject");
  const ambiguousAvailability =
    parts.some((c) => classify(c) === "ambiguous") && rejected.length === 0;
  const hadRejection = rejected.length > 0;
  const hasProposalCue = PROPOSAL_CUE_RE.test(text) && MENTION_RE.test(text);
  let clearDate = false;
  let clearTime = false;

  for (const c of rejected) {
    const hasMention = MENTION_RE.test(c);
    if (/too (early|late)/i.test(c) && !/\d/.test(c)) clearTime = true;
    if (/too (far|soon)/i.test(c) && !MENTION_RE.test(c)) clearDate = true;
    if (hasMention) {
      const day = resolveDateWord(c);
      if (day && stored.date && dayName(day) === dayName(stored.date)) clearDate = true;
      if (stored.time && sameBare(c, stored.time)) clearTime = true;
    }
  }

  // "Actually, can we do 4:30?" with a time already stored: a bare hour (no am/pm) that differs from the stored time is a
  // change request, not noise. Drop the stored time (and with it the stale approval) so the receptionist asks AM or PM.
  if (!hadRejection && stored.time && hasProposalCue) {
    const bare = parseBareHour(text);
    if (bare && parseTime(text) === undefined && !sameBare(text, stored.time)) clearTime = true;
  }

  if (!hadRejection && text === norm(message)) {
    return {
      proposalText: norm(message),
      clearDate,
      clearTime,
      hadRejection,
      hasProposalCue,
      ambiguousAvailability,
    };
  }
  const proposals = parts.filter((c) => classify(c) !== "reject");
  const proposalText = hadRejection ? proposals.join(". ") : text;
  return {
    proposalText,
    clearDate,
    clearTime,
    hadRejection,
    hasProposalCue,
    ambiguousAvailability,
  };
}
