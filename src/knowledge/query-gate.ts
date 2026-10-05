import { contentTerms } from "./text";
import type { KnowledgeHistoryTurn, KnowledgeLookupInput } from "./types";

/**
 * "Do we need business knowledge for this message at all?" — decided
 * deterministically BEFORE any embedding or retrieval happens, so the
 * overwhelming majority of turns (yes / no / a name / 2pm / a booking
 * confirmation / a correction) cost nothing and cannot be misrouted into
 * RAG.
 *
 * The line it draws is the architectural one: KNOWLEDGE questions
 * ("how much is a cleaning", "do you take insurance", "what's your
 * cancellation policy") may consult RAG. SCHEDULING requests ("can I come
 * Thursday at 3", "anything available tomorrow") never do — those belong
 * to the deterministic calendar, which this gate cannot and does not
 * answer.
 */

export interface GateDecision {
  consult: boolean;
  /** Why — logged, so a skipped lookup is explainable. */
  reason: string;
}

const SHORT_ACK_RE =
  /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|alright|no|nope|nah|thanks?|thank you|thx|cool|great|perfect|got it|sounds good|go ahead|please do|hi|hello|hey|good (morning|afternoon|evening))\b[\s!.,]*$/i;

const QUESTION_START_RE =
  /^\s*(do|does|did|is|are|am|was|were|can|could|would|will|should|what|what's|whats|how|when|where|which|who|why|any|got|tell me|(and )?(what|how) about|i('d| would)? (like|want) to know|i was wondering|wondering|curious)\b/i;

const META_RE =
  /^\s*(who are you|are you (a |an )?(real|human|bot|robot|ai|person|machine)|how are you|what can you do|can you help( me)?\b[\s?!.]*$|what('s| is) your name|who am i (talking|speaking) (to|with))/i;

/** Words that make a message about SCHEDULING rather than information. */
const SCHEDULING_RE =
  /\b(book(ing)?|schedul\w*|reschedul\w*|availab\w*|openings?|slots?|come in|squeeze|fit me|move my|change my|same time|different time|cancel (my|the|that|it)|can i (come|get|see|make)|could i (come|get|see|make))\b/i;

const DAY_OR_TIME_RE =
  /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|next week|this week|\d{1,2}(:\d{2})?\s?(am|pm)|noon|morning|afternoon|evening)\b/i;

/** Words that make a message clearly about business INFORMATION even when
 * a scheduling word is also present ("what's your cancellation POLICY",
 * "how much is a cleaning appointment"). */
const STRONG_INFO_RE =
  /\b(polic(y|ies)|fees?|charges?|penalt\w*|refund\w*|deposit|what happens (if|when)|insurance|coverage|payment|pay|accept|price|prices|cost|costs|how much|hours|open|close[sd]?|parking|located|location|address|where|bring|arrive|early|wait(ing)?|promotion|discount|special|pediatric|children|kids?|how long|what (should|do) i (bring|need))\b/i;

const INFO_TOPIC_RE =
  /\b(polic(y|ies)|insurance|coverage|payment|price|prices|cost|costs|hours|parking|located|location|address|bring|arrive|refund|deposit|discount|promotion|financing|nib|colina)\b/i;

const ELLIPTICAL_RE = /^\s*(and|also|what about|how about|and what about|and how about)\b/i;

function previousKnowledgeQuestion(history: KnowledgeLookupInput["history"]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "customer") continue;
    const q = /\?/.test(turn.content) || QUESTION_START_RE.test(turn.content) || INFO_TOPIC_RE.test(turn.content);
    if (q && !SCHEDULING_RE.test(turn.content) && contentTerms(turn.content).length > 0) return turn.content;
    return undefined;
  }
  return undefined;
}

/** Pure and synchronous. */
export function decideKnowledgeLookup(input: KnowledgeLookupInput): GateDecision {
  const message = input.message.trim();
  if (!message) return { consult: false, reason: "empty" };
  if (SHORT_ACK_RE.test(message)) return { consult: false, reason: "short_acknowledgement" };

  // "and what about root canal" right after "how much is a cleaning": the
  // follow-up has no question words of its own, but it IS the same
  // knowledge question about a different subject.
  if (ELLIPTICAL_RE.test(message) && !DAY_OR_TIME_RE.test(message) && previousKnowledgeQuestion(input.history)) {
    return { consult: true, reason: "contextual_follow_up" };
  }

  const hasQuestionSignal = /\?/.test(message) || QUESTION_START_RE.test(message) || INFO_TOPIC_RE.test(message);
  const strongInfo = STRONG_INFO_RE.test(message);

  // A bare booking field ("Friday", "Trevor", a phone number) ANSWERS the
  // question the receptionist just asked — but only when a booking is
  // actually in progress. With none in progress, a message that also asks
  // a question ("it's Maria, 242-555-0123 — do you do orthodontics?")
  // still deserves a grounded answer.
  if (input.context.extractedBookingField && input.context.hasActiveIntent && !strongInfo) {
    return { consult: false, reason: "booking_field_supplied" };
  }
  if (input.context.hasPendingConfirmation && !(hasQuestionSignal && strongInfo)) {
    return { consult: false, reason: "confirmation_turn" };
  }
  if (META_RE.test(message)) return { consult: false, reason: "meta_question" };

  const schedulingish = SCHEDULING_RE.test(message) || DAY_OR_TIME_RE.test(message);
  if (schedulingish && !strongInfo) return { consult: false, reason: "scheduling_request" };

  if (!hasQuestionSignal) return { consult: false, reason: "not_a_question" };
  if (contentTerms(message).length === 0 && !ELLIPTICAL_RE.test(message)) {
    return { consult: false, reason: "no_informative_terms" };
  }
  return { consult: true, reason: "knowledge_question" };
}

export interface ContextualizedQuery {
  /** What to embed / match: the customer's own words. */
  text: string;
  /** Extra canonical terms carried over from the previous question. */
  extraTerms: string[];
}

/**
 * Resolves a short follow-up ("and what about root canal") against the
 * previous knowledge question ("how much is a cleaning") by carrying over
 * the previous question's ATTRIBUTE terms (price) but not its SUBJECT
 * terms (cleaning) — so the follow-up asks for the root canal PRICE, not
 * for something about cleanings and root canals at once.
 */
export function contextualizeQuery(
  message: string,
  history: KnowledgeHistoryTurn[],
  subjectTerms: Set<string>,
): ContextualizedQuery {
  const words = message.trim().split(/\s+/).length;
  if (!ELLIPTICAL_RE.test(message) || words > 9) return { text: message, extraTerms: [] };

  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "customer") continue;
    const looksLikeQuestion = /\?/.test(turn.content) || QUESTION_START_RE.test(turn.content) || INFO_TOPIC_RE.test(turn.content);
    if (!looksLikeQuestion) continue;
    const carried = contentTerms(turn.content).filter((t) => !subjectTerms.has(t));
    if (carried.length === 0) continue;
    return { text: message, extraTerms: carried };
  }
  return { text: message, extraTerms: [] };
}
