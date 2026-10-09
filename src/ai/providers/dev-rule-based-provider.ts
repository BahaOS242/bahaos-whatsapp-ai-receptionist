import { correctionBlocksBareName, extractNameContrast, hasCorrectionLanguage, stripCorrectionLanguage, trimNameAtBoundary } from "../correction-language";
import {
  resolveDateWord,
  parseTime,
  parseBareHour,
  parseBareMeridiem,
  combineBareTime,
  stripRecognizedDateTime,
  detectBareMonthMention,
} from "../date-time";
import { extractPhone } from "../phone";
import {
  describeInvalidTime,
  isWithinOperatingWindow,
  validateAppointmentTime,
} from "../business-hours";
import { describeUnavailable, findAlternativeTimes, isSlotAvailable } from "../availability";
import { EMERGENCY_RE, ESCALATE_RE } from "../escalation-triggers";
import {
  buildBookingSummary,
  composeConfirmationPrompt,
  composeRecurringConfirmationOrConflict,
  composeRecurringUnavailableEscalation,
} from "../booking-confirmation";
import { truncatePhrase } from "../unclear-phrase";
import { composeConflictReply, composeExtractiveAnswer, composeNoEvidenceReply } from "../../knowledge/replies";
import { extractStatedFields as extractSharedStatedFields } from "../message-field-extraction";
import { detectRecurrenceIntervalMonths, generateOccurrenceDates, isRecurringIntentMessage, RECURRING_OCCURRENCE_COUNT } from "../recurrence";
import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResponse,
  BookingIntent,
  BookingState,
  BusinessContext,
} from "../types";

/**
 * Deterministic, regex-based AIProvider — no network call, no API key.
 * Used as the default when no LLM is configured, and as the provider for
 * every automated test that needs predictable output.
 *
 * Architecture note: this provider extracts fields ONLY from the current
 * message, merges them into the BookingState it was handed (already
 * persisted by ConversationManager from earlier turns), and returns the
 * updated state. It never re-parses `history` text to figure out what's
 * already known or what's currently being asked — "what's currently being
 * asked" is derived from which fields BookingState is still missing, not
 * from pattern-matching this provider's own previous reply text. That
 * distinction is what fixes the "asks for the same info twice" bug: a
 * fact is extracted once, when it's said, and trusted afterward.
 */
export class DevRuleBasedAIProvider implements AIProvider {
  async generateResponse(request: AIProviderRequest): Promise<AIProviderResponse> {
    const { business, message } = request;
    // `rawBookingState` (with whatever unclearTurnCount was carried in)
    // is read ONLY by the "genuinely not understood" branch far below,
    // to compute whether THIS is a second consecutive unclear turn.
    // Every other branch below uses the CLEARED `bookingState` — any
    // turn that's actually understood (an emergency, an escalation
    // request, a real FAQ, a greeting, a recognized flow, ...) must
    // reset the counter, or a legitimate exchange in between two
    // unrelated unclear messages would wrongly count as consecutive.
    const rawBookingState = request.bookingState;
    const { unclearTurnCount: _unclearTurnCount, ...bookingState } = rawBookingState;
    const intent = detectIntent(message);

    if (intent === "emergency") {
      return {
        reply: business.policies.emergencyPolicy,
        actions: [{ type: "escalate", payload: { reason: "possible dental emergency" } }],
        bookingState,
      };
    }
    if (intent === "escalate") {
      return {
        reply: business.escalationHandoffMessage,
        actions: [
          { type: "escalate", payload: { reason: "customer explicitly asked for a person" } },
        ],
        bookingState,
      };
    }
    if (intent === "abandon") {
      // Exits whatever NEW booking/reschedule/cancellation flow was in
      // progress — never an existing-appointment cancellation (that's a
      // distinct, explicit intent — see "cancel" below and
      // appointment-management behavior). No action is taken; there is
      // nothing to flag staff about.
      return {
        reply:
          "No problem — I won't continue with that. Let me know if you'd like to start something else.",
        actions: [],
        bookingState: {},
      };
    }
    if (intent === "ambiguous_compound") {
      // A message asking one thing conditionally on another ("are you
      // open Saturday? If not, book me Monday") mixes an FAQ and a
      // booking request across a conditional the deterministic provider
      // has no reliable way to resolve — guessing risks silently booking
      // the wrong thing. Failing safely here (ask for clarification,
      // touch nothing) is the deliberate choice over growing this
      // provider's regex surface to parse conditionals; LLMProvider
      // handles richer language in production.
      return {
        reply:
          "I want to make sure I get that exactly right — could you send that as two separate messages? First your question, then what you'd like to do.",
        actions: [],
        bookingState,
      };
    }
    // Business knowledge (RAG), only when the engine is enabled. Offered
    // ONLY the intents whose regexes can't answer a business question on
    // their own — hours/location/services/price/insurance/new-patient keep
    // their existing deterministic answers from BusinessContext (the
    // structured-configuration tier). The query gate additionally refuses
    // anything that is really a scheduling request.
    if (request.knowledge && KNOWLEDGE_ELIGIBLE_INTENTS.has(intent)) {
      const answered = await answerFromKnowledge(request, bookingState);
      if (answered) return answered;
    }
    if (intent === "price") {
      return answerPriceInquiry(business, bookingState, message);
    }
    if (FAQ_INTENTS.has(intent)) {
      const faqReply = faqReplyFor(business, intent);
      if (bookingState.intent) {
        return { reply: `${faqReply} ${resumePrompt(business, bookingState)}`, actions: [], bookingState };
      }
      return { reply: faqReply, actions: [], bookingState };
    }

    const flowState = resolveFlowState(intent, bookingState);
    if (flowState) {
      return handleFlowTurn(business, flowState, message, request.checkAvailability);
    }

    switch (intent) {
      case "greeting":
        return {
          reply: `Hi! Thanks for contacting ${business.name}. How can I help you today?`,
          actions: [],
          bookingState,
        };
      case "thanks":
        return {
          reply: "You're welcome! Anything else I can help with?",
          actions: [],
          bookingState,
        };
      default: {
        const svc = findService(business, message);
        if (svc) {
          // Not yet a committed booking flow — the customer only mentioned
          // a service, they haven't said "book" or "yes" to anything. But
          // the reply below DOES pose a yes/no question, so the answer to
          // it must be recoverable from state, not guessed from the next
          // message's wording. See PendingAction.
          return {
            reply: `Yes — ${svc.name} is ${svc.priceLabel} and takes about ${svc.durationMinutes} minutes. Would you like to book it?`,
            actions: [],
            bookingState: {
              intent: "book_appointment",
              service: svc.name,
              name: bookingState.name,
              phone: bookingState.phone,
              pendingAction: "confirm_service",
            },
          };
        }
        // Objective 4: "the receptionist must be comfortable admitting
        // uncertainty" — a single unrecognized message still gets one
        // honest "I didn't catch that" chance, but the SECOND
        // CONSECUTIVE one escalates rather than repeating the same
        // question forever. See bookingState.unclearTurnCount's
        // docstring (types.ts) — this can only ever lead to escalation,
        // never to booking anything. Reads rawBookingState (not the
        // cleared `bookingState` above) specifically to see the PRIOR
        // turn's own count.
        const consecutiveUnclear = (rawBookingState.unclearTurnCount ?? 0) + 1;
        // Item 5 — unknown-phrase learning foundation: nothing here
        // matched ANY recognized intent/service/flow at all, the
        // broadest and clearest "genuinely unclear" signal this
        // provider has. Recorded purely for future human review — never
        // read back by this turn or any other live behavior (see
        // AIProviderResponse.unclearPhraseObservation's docstring).
        const unclearPhraseReason = "no recognized intent, service, or active flow matched this message";
        const unclearPhraseContext = bookingState.intent
          ? `intent=${bookingState.intent}; nextRequiredField=${missingFields(bookingState)[0] ?? "none"}`
          : "intent=none";
        if (consecutiveUnclear >= UNCLEAR_TURN_ESCALATION_THRESHOLD) {
          // `bookingState` is already the cleared version (see top of
          // this method) — nothing further to strip.
          return {
            reply:
              "I want to make sure you get the right help — let me connect you with a member of our team.",
            actions: [
              {
                type: "escalate",
                payload: {
                  reason: "customer's messages could not be understood after repeated attempts",
                  unresolvedQuestion: message,
                },
              },
            ],
            bookingState,
            unclearPhraseObservation: {
              phrase: truncatePhrase(message),
              reason: `${unclearPhraseReason}; escalated after repetition`,
              context: unclearPhraseContext,
              outcome: "escalated",
            },
          };
        }
        return {
          reply:
            "I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?",
          actions: [],
          bookingState: { ...bookingState, unclearTurnCount: consecutiveUnclear },
          unclearPhraseObservation: {
            phrase: truncatePhrase(message),
            reason: unclearPhraseReason,
            context: unclearPhraseContext,
            outcome: "asked_for_clarification",
          },
        };
      }
    }
  }
}

type Intent =
  | "emergency"
  | "escalate"
  | "abandon"
  | "ambiguous_compound"
  | "recurring"
  | "book"
  | "reschedule"
  | "cancel"
  | "hours"
  | "location"
  | "services"
  | "price"
  | "insurance"
  | "new_patient"
  | "greeting"
  | "thanks"
  | "unknown";

/** Objective 4 — see llm-provider.ts's identically-named/valued constant
 * for the full rationale. Kept as a separate constant (not shared)
 * since these two providers are already a deliberate, documented
 * duplication of judgment calls like this one, not a shared source of
 * truth. */
const UNCLEAR_TURN_ESCALATION_THRESHOLD = 2;

/** Abandonment/exit — "the customer wants to stop" has no keyword at all
 * today; this is that intent. Deliberately targets phrasing that refers
 * to THE CURRENT (new, in-progress) request — "cancel that", "forget
 * it" — not an existing appointment, which stays its own "cancel" intent
 * below (checked after this, so "cancel my appointment" still falls
 * through to it) and asks for a name/phone to look one up. */
const ABANDON_RE =
  /\bnever\s*mind\b|\bforget it\b|\bleave it\b|\bcancel (that|this)\b|\bi'?m done\b|\bi'?m out\b|\bdon'?t want (it|to book|that)\b|\bnot interested\b/i;

/** A conditional/compound structure spanning two clauses ("are you open
 * Saturday? If not, book me Monday") — a narrow, single-signal detector
 * (one connector word + a question mark), not a growing parser for
 * compound language. See ROOT CAUSE #10 in the torture-suite report:
 * this is deliberately NOT solved with more regex — it fails safely and
 * asks for clarification instead. */
const CONDITIONAL_CONNECTOR_RE = /\bif not\b|\bunless\b|\bor else\b|\botherwise\b/i;
function looksLikeAmbiguousCompound(text: string): boolean {
  return CONDITIONAL_CONNECTOR_RE.test(text) && /\?/.test(text);
}

/** "How much is X" / "what's the price/cost" — a price inquiry, answered
 * using whatever service is contextually relevant (see
 * answerPriceInquiry) rather than always listing everything. */
const PRICE_RE = /\bhow much\b|\bwhat'?s the (price|cost)\b|\bwhat (is|are) the (price|cost)\b/i;

function detectIntent(text: string): Intent {
  if (EMERGENCY_RE.test(text)) return "emergency";
  if (ESCALATE_RE.test(text)) return "escalate";
  if (ABANDON_RE.test(text)) return "abandon";
  if (looksLikeAmbiguousCompound(text)) return "ambiguous_compound";
  if (/\bcancel\b|\bcan'?t make it\b/i.test(text)) return "cancel";
  if (/\bresched/i.test(text) || /\bmove my appointment\b/i.test(text)) return "reschedule";
  // Checked BEFORE plain "book" — Section 5's own examples ("Book me
  // every six months," "Schedule this every year") mix an ordinary
  // book/schedule keyword with an explicit recurrence interval; the
  // recurrence must win, mirroring LLMProvider's identical ordering
  // decision in message-field-extraction.ts's detectStatedIntent.
  if (isRecurringIntentMessage(text)) return "recurring";
  if (/\bbook\b|\bschedule\b|\bappointment\b/i.test(text)) return "book";
  if (/\bhours?\b|\bopen\b|\bclose[sd]?\b/i.test(text)) return "hours";
  if (/\bwhere\b|\blocation\b|\baddress\b/i.test(text)) return "location";
  if (/\bservices?\b|\bdo you (do|offer)\b/i.test(text)) return "services";
  if (PRICE_RE.test(text)) return "price";
  if (/\binsurance\b|\bcoverage\b/i.test(text)) return "insurance";
  if (/\bnew patients?\b|\bfirst visit\b/i.test(text)) return "new_patient";
  if (/\bthank(s| you)\b/i.test(text)) return "thanks";
  if (/^\s*(hi|hello|hey)[!.,\s]*$/i.test(text)) return "greeting";
  return "unknown";
}

const FAQ_INTENTS = new Set<Intent>(["hours", "location", "services", "insurance", "new_patient"]);

/** Intents that may be a business-knowledge question the regexes above
 * can't answer (e.g. "what should I bring", "what happens if I cancel"). */
// "services" is eligible because its regex also catches "do you offer X" /
// "do you do X" — which is a question about X, not a request for the list.
// The gate still sends a bare "what services do you offer" back to the
// deterministic list (no informative terms).
const KNOWLEDGE_ELIGIBLE_INTENTS = new Set<Intent>(["unknown", "cancel", "reschedule", "book", "recurring", "services"]);

/** Consults the knowledge engine for one turn. Returns a finished
 * response when the engine answered (or refused), undefined to carry on
 * with the provider's normal flow. Extractive only: it can repeat the
 * evidence, never add to it. */
async function answerFromKnowledge(
  request: AIProviderRequest,
  bookingState: BookingState,
): Promise<AIProviderResponse | undefined> {
  const { business, message } = request;
  if (!request.knowledge) return undefined;
  const extracted = extractSharedStatedFields(business, message, bookingState);
  const lookup = await request.knowledge({
    message,
    history: request.history,
    context: {
      hasActiveIntent: !!bookingState.intent,
      hasPendingConfirmation: !!bookingState.pendingAction,
      extractedBookingField: Object.entries(extracted).some(([k, v]) => k !== "intent" && v !== undefined),
    },
  });
  if (!lookup.consulted) return undefined;

  const midBooking = !!bookingState.intent;
  if (lookup.outcome === "no_evidence") {
    return {
      reply: composeNoEvidenceReply({ midBooking }),
      actions: [],
      bookingState,
      knowledgeGap: { reason: lookup.noEvidenceReason ?? "below_threshold", question: "" },
    };
  }
  if (lookup.outcome === "conflict") {
    return {
      reply: composeConflictReply(lookup.conflicts, business, { midBooking }),
      actions: [],
      bookingState,
      knowledgeGap: { reason: "conflict", question: "" },
    };
  }
  const answer = composeExtractiveAnswer(lookup.evidence, message);
  const resume = midBooking ? resumePrompt(business, bookingState) : "";
  return { reply: resume ? `${answer} ${resume}` : answer, actions: [], bookingState };
}

/** Plain-English answer for one FAQ intent — shared by the standalone
 * (no active flow) and mid-flow (active booking preserved, resumed
 * after) paths, so there is exactly one place each answer is worded. */
function faqReplyFor(business: BusinessContext, intent: Intent): string {
  switch (intent) {
    case "hours":
      return `We're open ${business.hours}.`;
    case "location":
      return `We're located at ${business.address}.`;
    case "services": {
      const list = business.services.map((s) => `${s.name} (${s.priceLabel})`).join(", ");
      return `We offer ${list}. Want details on one, or should I help you book?`;
    }
    case "insurance":
      return business.policies.insurance;
    case "new_patient":
      return business.policies.newPatientInfo;
    default:
      return "";
  }
}

/** What to ask next to resume an active flow after answering a side
 * question — reuses the exact same logic the flow itself would use, so
 * the resume prompt is never out of sync with what's actually missing. */
function resumePrompt(business: BusinessContext, state: BookingState): string {
  if (state.pendingAction === "confirm_service") {
    return `Would you like to book ${state.service}?`;
  }
  if (state.pendingAction === "confirm_booking") {
    return composeConfirmationPrompt(business, state);
  }
  if (!state.intent) return "";
  const missing = missingFields(state);
  if (missing.length === 0) return "";
  return askForField(state.intent, missing);
}

/** Answers "how much is X" / "how much is that" using whatever service is
 * contextually relevant: a service named IN THIS message takes priority
 * (so asking about a different service mid-booking answers about THAT
 * service, never silently switches what's being booked — see ROOT CAUSE
 * #1/#7), falling back to the service already under discussion. Preserves
 * bookingState unchanged either way. */
function answerPriceInquiry(
  business: BusinessContext,
  bookingState: BookingState,
  message: string,
): AIProviderResponse {
  const mentioned = findService(business, message);
  const contextServiceName = mentioned?.name ?? bookingState.service;
  const svc = contextServiceName
    ? business.services.find((s) => s.name === contextServiceName)
    : undefined;

  const answer = svc
    ? `${svc.name} is ${svc.priceLabel} and takes about ${svc.durationMinutes} minutes.`
    : `Here's our pricing: ${business.services.map((s) => `${s.name} (${s.priceLabel})`).join(", ")}.`;

  if (bookingState.intent) {
    return { reply: `${answer} ${resumePrompt(business, bookingState)}`, actions: [], bookingState };
  }
  return { reply: answer, actions: [], bookingState };
}

const INTENT_TO_FLOW: Partial<Record<Intent, BookingIntent>> = {
  book: "book_appointment",
  reschedule: "reschedule_appointment",
  cancel: "cancel_appointment",
  recurring: "book_recurring_appointment",
};

/** Decides which flow (if any) this turn belongs to, purely from
 * structured data: an explicit intent keyword in the new message, or an
 * already-in-progress flow from the persisted state. Never inspects this
 * provider's own previous reply text. */
function resolveFlowState(intent: Intent, bookingState: BookingState): BookingState | undefined {
  const requestedFlow = INTENT_TO_FLOW[intent];

  if (requestedFlow && requestedFlow !== bookingState.intent) {
    // Switching tasks: identity info (name/phone) is still reusable, but
    // service/date/time belonged to whatever task was previously active.
    return { intent: requestedFlow, name: bookingState.name, phone: bookingState.phone };
  }
  if (requestedFlow) {
    return bookingState;
  }
  if (bookingState.intent) {
    return bookingState;
  }
  return undefined;
}

const REQUIRED_FIELDS: Record<BookingIntent, (keyof BookingState)[]> = {
  book_appointment: ["service", "date", "time", "name", "phone"],
  reschedule_appointment: ["date", "time", "name", "phone"],
  cancel_appointment: ["name", "phone"],
  book_recurring_appointment: ["service", "date", "time", "recurrenceIntervalMonths", "name", "phone"],
};

function missingFields(state: BookingState): (keyof BookingState)[] {
  if (!state.intent) return [];
  return REQUIRED_FIELDS[state.intent].filter((field) => !state[field]);
}

/** Only the exact, unambiguous "my name is X" phrasing is trusted
 * unconditionally — nobody uses it to mean anything else. */
const HIGH_CONFIDENCE_NAME_RE = /\bmy name is\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)/i;

/** "I'm X" / "this is X" / "it's X" are far more ambiguous — "I'm done",
 * "I'm out", "This is ridiculous" all match this shape without being a
 * name at all. Only ever consulted when name is actually the field being
 * asked about right now (see isNameCurrentlyAsked) — never unconditionally. */
const LOW_CONFIDENCE_NAME_RE =
  /\b(?:i'?m|this is|it'?s)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)/i;

/** Matches the full service name first ("Routine cleaning"), falling back
 * to its last word ("cleaning") so a casual mention ("book a cleaning")
 * still resolves — a real LLM wouldn't need this crutch, but this is the
 * deterministic fallback provider. */
function findService(business: BusinessContext, text: string) {
  const lower = text.toLowerCase();
  const exactMatches = business.services.filter((s) => lower.includes(s.name.toLowerCase()));
  // Same fix as message-field-extraction.ts's own findService — see its
  // comment. "Should I get a cleaning or a filling?" naming TWO services
  // is genuinely ambiguous, not a choice; guessing the one that happens
  // to come first in business.services is exactly what item 4's "do NOT
  // guess" rule exists to prevent.
  if (exactMatches.length > 1) return undefined;
  if (exactMatches.length === 1) return exactMatches[0];

  // Widened from "last word only" to "any significant word" — genuine
  // gap found during Final V1 Hardening: "consultation" alone (arguably
  // the most natural way to say "Dental consultation / basic exam") was
  // never recognized, only "exam." Safe past a single word because of
  // the ambiguity guard above — a shared word ("basic," in both this
  // service and "Basic filling") is correctly treated as ambiguous, not
  // guessed.
  // Word-BOUNDARY matching, not substring — same fix as
  // message-field-extraction.ts's own findService (see its comment):
  // plain `.includes()` matched "basic" inside "basically," turning a
  // filler word into a false, ambiguity-triggering service match.
  const wordMatches = business.services.filter((s) =>
    s.name
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.length > 3 && new RegExp(`\\b${word}\\b`).test(lower)),
  );
  if (wordMatches.length > 1) return undefined;
  return wordMatches[0];
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Is `field` specifically one of the thing(s) this flow would ask about
 * right now — mirroring askForField's own "what's the next question"
 * logic exactly (including the date+time and name+phone combined asks),
 * so a field is never considered "currently asked" by one check and
 * answered by a different prompt. Used to let a direct answer to the
 * question just posed update a field WITHOUT needing an explicit
 * correction marker, even in the (structurally impossible under
 * REQUIRED_FIELDS today, but kept explicit for clarity and to stay
 * correct if that ever changes) case where the field already has a
 * stale value. */
function isFieldCurrentlyAsked(state: BookingState, field: keyof BookingState): boolean {
  const missing = missingFields(state);
  if (missing.length === 0) return false;
  const next = missing[0];
  if (next === field) return true;
  if (next === "date" && field === "time" && missing.includes("time")) return true;
  if (next === "name" && field === "phone" && missing.includes("phone")) return true;
  return false;
}

/** Is name specifically the next thing this flow would ask about right
 * now? The explicit field-being-asked check that gates every
 * low-confidence name signal (see LOW_CONFIDENCE_NAME_RE and the bare-name
 * fallback below) — replaces the old "is name missing ANYWHERE" check,
 * which is what let "pm", "lol", "never mind", and full sentences get
 * swallowed as a name just because name happened to be unset somewhere
 * in the flow, regardless of what was actually being asked. */
function isNameCurrentlyAsked(state: BookingState): boolean {
  return isFieldCurrentlyAsked(state, "name");
}

/** Extracts every field this message states outright, independent of
 * conversation position — service mention, resolvable date word,
 * unambiguous (am/pm-qualified) time, a normalizable phone number, and an
 * explicitly-hinted name. Low-confidence name phrasing ("I'm X") is only
 * attempted when the caller says name is actually being asked right now
 * — see isNameCurrentlyAsked; "my name is X" is always attempted, since
 * it's unambiguous regardless of context. */
function extractStatedFields(
  business: BusinessContext,
  text: string,
  options: { allowLowConfidenceName: boolean },
): Partial<BookingState> {
  const fields: Partial<BookingState> = {};

  const svc = findService(business, text);
  if (svc) fields.service = svc.name;

  const date = resolveDateWord(text, new Date(), business.timezone);
  if (date) fields.date = date;

  const time = parseTime(text);
  if (time) fields.time = time;

  const phone = extractPhone(text, business.areaCode);
  if (phone) fields.phone = phone;

  const interval = detectRecurrenceIntervalMonths(text);
  if (interval) fields.recurrenceIntervalMonths = interval;

  const highConfidenceName = text.match(HIGH_CONFIDENCE_NAME_RE);
  if (highConfidenceName) {
    const introduced = trimNameAtBoundary(highConfidenceName[1]);
    if (introduced) fields.name = titleCase(introduced);
  } else if (options.allowLowConfidenceName) {
    const lowConfidenceName = text.match(LOW_CONFIDENCE_NAME_RE);
    if (lowConfidenceName) fields.name = titleCase(lowConfidenceName[1].trim());
  }

  return fields;
}

/** After stripping out a matched phone-number substring, is what's left a
 * plausible bare name? Structural checks only (length, no digits, not
 * itself a recognized intent) — this is deliberately NOT a growing
 * keyword blacklist; implausible candidates are filtered out by context
 * (see nameEligible in handleFlowTurn) rather than by guessing every word
 * a name could never be. */
function looksLikeBareName(remainder: string): boolean {
  const candidate = remainder.trim();
  if (!candidate || candidate.length > 40) return false;
  if (/\d/.test(candidate)) return false;
  if (detectIntent(candidate) !== "unknown") return false;
  return true;
}

/** A stricter variant used only when the ONLY signal that a bare name
 * might be present is a date and/or time mentioned in the same message
 * (see the "weak signal" path in handleFlowTurn) — a date/time mention is
 * a much weaker indicator than a phone number or name being the field
 * actually asked about, so the leftover candidate must look more clearly
 * name-shaped:
 *   - at most two words, once the recognized date/time text is stripped
 *     out — lets "Trevor Tuesday 2pm" capture "Trevor" while "Tuesday
 *     2pm, I don't know yet" doesn't capture "I Don't Know Yet";
 *   - capitalized in the ORIGINAL message — a real name is written that
 *     way; a stray connector word left over from stripping date/time out
 *     of a normal sentence ("at" from "Tuesday at 2pm", "on" from "on
 *     Tuesday") is not. This is what stops "Tuesday at 2pm" (a complete,
 *     unambiguous date+time answer with nothing else stated) from
 *     capturing "At" as the customer's name.
 * Still purely structural (shape and casing), not a keyword blacklist. */
function looksLikeBareNameStrict(remainder: string): boolean {
  if (!looksLikeBareName(remainder)) return false;
  const trimmed = remainder.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0 || wordCount > 2) return false;
  return /^[A-Z]/.test(trimmed);
}

const PHONE_SUBSTRING_RE = /(\+?\d[\d\s().-]{5,}\d)/;

/** Narrowly-scoped affirmative phrasing — the fixed word list plus a
 * handful of common confirming phrases ("sounds good", "that works",
 * "perfect"). Every added alternative uses exact phrasing rather than a
 * bare adjective ("good"/"great"/"ok" alone are deliberately excluded)
 * specifically so a negated sentence ("that doesn't work for me", "that
 * doesn't sound good") can never match — English's own grammar (work(s),
 * sound(s)) keeps the negated and affirmative forms textually distinct. */
const AFFIRMATIVE_RE =
  /\b(yes|yeah|yep|yup|sure|of course|sounds good|sounds great|that works|works for me|perfect)\b/i;
const NEGATIVE_RE = /\b(no|nope|nah)\b/i;

/** Structured yes/no detection — only ever consulted once BookingState
 * says a specific question is pending (see PendingAction); never used to
 * guess what an unprompted "yes" refers to. */
function detectYesNo(text: string): "yes" | "no" | undefined {
  const isNegative = NEGATIVE_RE.test(text);
  const isAffirmative = AFFIRMATIVE_RE.test(text);
  if (isNegative && !isAffirmative) return "no";
  if (isAffirmative && !isNegative) return "yes";
  return undefined;
}

/** Does this message carry booking-relevant content beyond a bare yes/no
 * word — a service/date/time/phone/name, or a bare hour like "3"? Used to
 * tell "nah, lemme change that to 3" (a correction, not a decline) apart
 * from a flat "no". */
function hasCorrectionContent(business: BusinessContext, message: string, currentName?: string): boolean {
  const stated = extractStatedFields(business, message, { allowLowConfidenceName: false });
  if (Object.keys(stated).length > 0) return true;
  if (extractNameContrast(message, currentName)) return true; // "It's Alisha, not Alicia"
  return parseBareHour(message) !== undefined;
}

/** Requiring an explicit correction/change signal before a NEW value can
 * overwrite an ALREADY-confirmed field — without this, any incidental
 * mention of a matching word (a different service's name in a price
 * question, "today" in "I'm running late today") silently overwrites
 * confirmed data. A field being set for the FIRST time is never gated by
 * this — only replacing a value that's already there. Deliberately a
 * small, explicit marker set, not a general "sounds like a correction"
 * classifier. */
const CORRECTION_MARKER_RE =
  /\bactually\b|\binstead\b|\bi meant\b|\bscratch that\b|\bcorrection\b|\bwrong (number|name|date|time)\b|\bchange (it|that)\b/i;

/** Resolves the one PendingAction kind that exists today: the customer
 * was offered a specific service and asked "Would you like to book it?".
 * A "yes" commits to booking that service and moves on to the next
 * missing field, applying anything ELSE said in the same message (e.g.
 * "yeah man, 2pm good" also carries the time). A "no" exits the flow
 * cleanly — UNLESS the message also carries correction content ("nah,
 * lemme change that to 3"), in which case it's treated like a "yes": the
 * customer still wants to book, just with something different. An
 * unrecognized reply re-asks rather than guessing either way. */
function handleServiceConfirmation(
  business: BusinessContext,
  state: BookingState,
  message: string,
  checkAvailability: AIProviderRequest["checkAvailability"],
): AIProviderResponse {
  const answer = detectYesNo(message);

  if (answer === "no") {
    if (hasCorrectionContent(business, message, state.name)) {
      const { pendingAction: _pendingAction, ...confirmed } = state;
      return handleFlowTurn(business, confirmed, message, checkAvailability);
    }
    return {
      reply: "No problem. If you'd like to book later, just let me know.",
      actions: [],
      bookingState: {},
    };
  }

  if (answer === "yes") {
    const { pendingAction: _pendingAction, ...confirmed } = state;
    return handleFlowTurn(business, confirmed, message, checkAvailability);
  }

  // Neither an explicit "yes" nor "no" — but the message may STILL be a
  // correction ("actually, a cleaning" — no "no" at all). Genuine bug
  // found during the Context & Human Conversation Pass: this branch
  // used to just re-ask the same yes/no question, silently discarding
  // the correction and leaving the STALE, un-corrected service pending
  // — exactly the "natural corrections must always win" failure this
  // pass exists to close, just at this EARLIER confirm_service gate
  // rather than the final hard-confirmation one (see
  // handleBookingConfirmation, which already had this exact check).
  if (hasCorrectionContent(business, message, state.name)) {
    const { pendingAction: _pendingAction, ...confirmed } = state;
    return handleFlowTurn(business, confirmed, message, checkAvailability);
  }

  return {
    reply: `Just to confirm — would you like to book ${state.service}? (yes/no)`,
    actions: [],
    bookingState: state,
  };
}

function encodeBareTime(bare: { hour: number; minute: number }): string {
  return `${bare.hour}:${bare.minute}`;
}

function decodeBareTime(value: string): { hour: number; minute: number } {
  const [hourText, minuteText] = value.split(":");
  return { hour: Number.parseInt(hourText, 10), minute: Number.parseInt(minuteText ?? "0", 10) };
}

/** Validates business hours for whichever flow type this is, mirroring
 * completeFlow's own per-flow choice of validator (duration-aware for a
 * new booking, duration-less for a reschedule — see business-hours.ts).
 * cancel_appointment has no date/time fields at all, so it's never
 * checked. If `service` isn't known yet (only reachable via an unusual
 * opening message that states a date/time before a service — normal flow
 * always asks for service first), duration falls back to 0: the smallest
 * possible duration can only make MORE times look valid than they really
 * are, never reject a genuinely valid one, and finishFlowTurn re-runs
 * this check on every subsequent turn — so once the real service (and
 * its real duration) becomes known, an over-optimistic accept is
 * corrected before name/phone are ever asked, not after. */
function validateFlowHours(
  business: BusinessContext,
  flow: BookingIntent,
  date: string,
  time: string,
  serviceName: string | undefined,
) {
  if (flow === "book_appointment") {
    const duration = business.services.find((s) => s.name === serviceName)?.durationMinutes ?? 0;
    return validateAppointmentTime(business, date, time, duration);
  }
  return isWithinOperatingWindow(business, date, time);
}

/** Finishes a flow turn once BookingState has been merged for this
 * message: complete the flow if nothing's missing, otherwise ask for
 * whatever's still needed. Shared by the normal extraction path and the
 * bare-time-completion path so both end the same way.
 *
 * Business-hours validation, then availability, happen HERE, the moment
 * date and time are BOTH known — required flow order: intent -> service
 * -> date -> time -> business-hours validation -> availability -> name ->
 * phone -> booking action. Both run before missingFields is even checked,
 * so an invalid or unavailable time is rejected (service and any
 * already-known name/phone preserved, time cleared, a new time requested)
 * before the customer is ever asked for their name or phone — not just as
 * a last check once every field, including name/phone, has already been
 * collected. Re-runs on every turn where date+time are both present, not
 * only the turn they were first set, so a later change (e.g. the real
 * service becoming known — see validateFlowHours) is always re-checked
 * too. Availability only applies to new bookings — a reschedule/
 * cancellation has no "slot" of its own to check against here. */
function finishFlowTurn(
  business: BusinessContext,
  merged: BookingState,
  checkAvailability: AIProviderRequest["checkAvailability"],
): AIProviderResponse {
  const flow = merged.intent!;

  if (flow !== "cancel_appointment" && merged.date && merged.time) {
    const validation = validateFlowHours(business, flow, merged.date, merged.time, merged.service);
    if (!validation.valid) {
      return rejectTime(
        merged,
        describeInvalidTime(business, validation, merged.date, merged.time),
      );
    }

    if (flow === "book_appointment" && !isSlotAvailable(business, merged.date, merged.time)) {
      const duration =
        business.services.find((s) => s.name === merged.service)?.durationMinutes ?? 0;
      const alternatives = findAlternativeTimes(business, merged.date, merged.time, duration);
      return rejectAvailability(
        merged,
        describeUnavailable(merged.date, merged.time, alternatives),
      );
    }
  }

  const stillMissing = missingFields(merged);
  if (stillMissing.length === 0) {
    // Objective 2's hard, non-negotiable gate: every required field being
    // known is NEVER enough on its own to actually book/reschedule/cancel
    // — completeFlow is only ever called from handleBookingConfirmation's
    // explicit "yes" branch below, never from here. See
    // presentBookingConfirmation and PendingAction's docstring (types.ts)
    // for why this uses "confirm_booking" rather than this provider's own
    // "confirm_service" (an earlier, different-purpose step).
    return presentBookingConfirmation(business, merged, checkAvailability);
  }
  return { reply: askForField(flow, stillMissing), actions: [], bookingState: merged };
}

/** The confirm-and-summarize step — Objective 2: "I have you down for X.
 * Reply YES to confirm the booking, or NO if you'd like to change
 * anything." Replaces the direct completeFlow call finishFlowTurn used
 * to make the instant every required field became known; see
 * handleBookingConfirmation for what happens to the reply.
 *
 * Section 9 extension: for a recurring flow, presenting ANY confirmation
 * requires checking every occurrence first (never silently skip a
 * conflict) — genuinely impossible without `checkAvailability` (the
 * clinic simulator). Absent it, escalates honestly instead of ever
 * showing a confirmation the app can't actually back up. Present, and a
 * genuine conflict is found: explains it and asks what the customer
 * wants instead of a confirmation, and pendingAction stays unset —
 * nothing is actually ready to confirm yet. */
function presentBookingConfirmation(
  business: BusinessContext,
  state: BookingState,
  checkAvailability: AIProviderRequest["checkAvailability"],
): AIProviderResponse {
  const { pendingBareTime: _pendingBareTime, ...clean } = state;

  if (clean.intent === "book_recurring_appointment") {
    if (!checkAvailability) {
      return {
        reply: composeRecurringUnavailableEscalation(clean.service, clean.recurrenceIntervalMonths!),
        actions: [
          {
            type: "escalate",
            payload: { reason: "recurring scheduling requested but not safely completable on this backend" },
          },
        ],
        bookingState: {},
      };
    }
    const recurring = composeRecurringConfirmationOrConflict(business, clean, checkAvailability);
    return {
      reply: recurring.reply,
      actions: [],
      bookingState: recurring.ready ? { ...clean, pendingAction: "confirm_booking" } : clean,
    };
  }

  const pending: BookingState = { ...clean, pendingAction: "confirm_booking" };
  return { reply: composeConfirmationPrompt(business, pending), actions: [], bookingState: pending };
}

/** Resolves pendingAction === "confirm_booking" — the ONLY path that can
 * ever reach completeFlow, making the hard-confirmation gate
 * unconditional regardless of how a turn got here. Mirrors LLMProvider's
 * buildAutoConfirmToolCall/buildDeclineResponse pair: an unambiguous
 * "yes" with nothing else stated completes; an unambiguous "no" (with no
 * correction content) declines, preserving every field except
 * pendingAction (same shape as LLMProvider's DECLINE_REPLY — never a
 * full wipe, since the customer may just want to adjust one thing); ANY
 * new field-like content in the message — even alongside a "yes" — is
 * treated as a correction, never a confirmation of a changed booking
 * (Objective 2: "the old confirmation must NEVER authorize the changed
 * booking"), and routes back through the normal flow so hours/
 * availability are re-validated and a FRESH confirmation is presented for
 * whatever's now true. Anything else re-asks rather than guessing. */
function handleBookingConfirmation(
  business: BusinessContext,
  state: BookingState,
  message: string,
  checkAvailability: AIProviderRequest["checkAvailability"],
): AIProviderResponse {
  if (hasCorrectionContent(business, message, state.name)) {
    const { pendingAction: _pendingAction, ...rest } = state;
    return handleFlowTurn(business, rest, message, checkAvailability);
  }

  const answer = detectYesNo(message);
  if (answer === "yes") {
    const { pendingAction: _pendingAction, pendingBareTime: _pendingBareTime, ...clean } = state;
    return completeFlow(business, state.intent!, clean, checkAvailability);
  }
  if (answer === "no") {
    const { pendingAction: _pendingAction, ...preserved } = state;
    // justDeclined: true gives the customer's very next word the same
    // correction license an explicit marker already has (see
    // BookingState.justDeclined's docstring, and handleFlowTurn's merge
    // loop below) — a bare restatement right after this decline
    // ("cleaning", no "actually"/"instead") must be able to overwrite
    // the stale, just-declined field.
    return {
      reply:
        "No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?",
      actions: [],
      bookingState: { ...preserved, justDeclined: true },
    };
  }

  if (state.intent === "book_recurring_appointment" && checkAvailability) {
    return {
      reply: composeRecurringConfirmationOrConflict(business, state, checkAvailability).reply,
      actions: [],
      bookingState: state,
    };
  }
  return { reply: composeConfirmationPrompt(business, state), actions: [], bookingState: state };
}

function handleFlowTurn(
  business: BusinessContext,
  incomingState: BookingState,
  message: string,
  checkAvailability: AIProviderRequest["checkAvailability"],
): AIProviderResponse {
  if (incomingState.pendingAction === "confirm_service") {
    return handleServiceConfirmation(business, incomingState, message, checkAvailability);
  }
  if (incomingState.pendingAction === "confirm_booking") {
    return handleBookingConfirmation(business, incomingState, message, checkAvailability);
  }

  // Bare hour + follow-up meridiem ("9" ... "pm" -> 21:00). Checked first
  // so a lone "am"/"pm" reply is always consumed as completing a
  // previously-stated bare hour — never left unrecognized, and never at
  // risk of being swallowed by the name fallback below.
  if (!incomingState.time && incomingState.pendingBareTime) {
    const meridiem = parseBareMeridiem(message);
    if (meridiem) {
      const { pendingBareTime, ...rest } = incomingState;
      const time = combineBareTime(decodeBareTime(pendingBareTime), meridiem);
      return finishFlowTurn(business, { ...rest, time }, checkAvailability);
    }
  }

  const nameCurrentlyAsked = isNameCurrentlyAsked(incomingState);
  const stated = extractStatedFields(business, message, {
    allowLowConfidenceName: nameCurrentlyAsked,
  });
  // An explicit contrast with the name on file ("It's Alisha, not Alicia") REPLACES it (provenance: the rejected
  // name equals the stored one). Treated as an explicit name statement, so no other correction wording is needed.
  const nameContrast = extractNameContrast(message, incomingState.name);
  if (nameContrast) stated.name = nameContrast;
  const hasCorrectionMarker = CORRECTION_MARKER_RE.test(message) || hasCorrectionLanguage(message);
  // justDeclined (see BookingState's docstring) gives the customer's
  // very next word after an explicit decline the SAME license an
  // explicit correction marker already has: a bare restatement right
  // after "no" ("cleaning", no "actually"/"instead") is overwhelmingly
  // likely to be the correction the decline was ABOUT, not incidental
  // content to ignore. Without this, that restatement was silently
  // dropped, the stale pre-decline field survived, pendingAction got
  // re-armed on it, and a later "yes" (answering whatever the flow asked
  // about the correction) auto-confirmed the WRONG, stale booking.
  const justDeclined = Boolean(incomingState.justDeclined);

  // Existing confirmed fields are only overwritten with an explicit
  // correction signal, UNLESS the field is specifically what's being
  // asked about right now — a direct answer to the question just posed
  // never needs a marker. Without this distinction, an incidental mention
  // (a different service's name in a price question, a stray "today")
  // could silently overwrite already-confirmed data. See ROOT CAUSE #1 in
  // the torture-suite report.
  const merged: BookingState = { ...incomingState };
  for (const key of Object.keys(stated) as (keyof BookingState)[]) {
    const value = stated[key];
    if (value === undefined) continue;
    const alreadySet = incomingState[key] !== undefined;
    const currentlyAsked = isFieldCurrentlyAsked(incomingState, key);
    // "My name is X" is an explicit identity statement: it may replace an earlier name
    // without any correction wording (explicit provenance beats a previously captured value).
    const explicitNameIntro = key === "name" && (HIGH_CONFIDENCE_NAME_RE.test(message) || Boolean(nameContrast));
    if (!alreadySet || currentlyAsked || hasCorrectionMarker || justDeclined || explicitNameIntro) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  // Consumed unconditionally — a one-shot hint for THIS turn only.
  merged.justDeclined = undefined;

  // Section 9: recurring scheduling can only be safely completed when a
  // clinic simulator is wired in (checkAvailability present) — every
  // occurrence must be genuinely checked, never guessed. Checked HERE,
  // right after extraction merges in whatever this turn established
  // (covers both "the interval was JUST stated this turn" and "it was
  // already known from an earlier turn, only checkAvailability is
  // missing") — as soon as intent AND an interval are both known, that's
  // already enough to know this can't be honored, so there's no point
  // asking for date/time/name/phone first just to escalate anyway. Same
  // early-bypass shape as LLMProvider's identical check.
  if (merged.intent === "book_recurring_appointment" && merged.recurrenceIntervalMonths && !checkAvailability) {
    return {
      reply: composeRecurringUnavailableEscalation(merged.service, merged.recurrenceIntervalMonths),
      actions: [
        {
          type: "escalate",
          payload: { reason: "recurring scheduling requested but not safely completable on this backend" },
        },
      ],
      bookingState: {},
    };
  }

  // Bare-name fallback: a candidate is only ever considered when nothing
  // ELSE in the message points to a different, incompatible field — a
  // service mention makes the leftover text too ambiguous to trust (see
  // out-of-order.test.ts #14, still a documented gap). Within that,
  // eligibility comes in two strengths:
  //   - STRONG: name is specifically what's being asked right now, or a
  //     phone number is in the same message — both were already reliable
  //     signals before this refinement, so they keep the permissive
  //     40-char looksLikeBareName check.
  //   - WEAK: a date and/or time was ALSO recognized in the same message
  //     ("Trevor Tuesday 2pm", no phone) — a real, but weaker, out-of-
  //     order signal, so the candidate must clear the stricter
  //     looksLikeBareNameStrict check (at most two words) instead, and
  //     the recognized date/time text is stripped out of the candidate
  //     before checking it (see stripRecognizedDateTime).
  // This replaces the old "name is missing ANYWHERE in the flow" check,
  // which is what let "pm", "lol", "never mind", and full sentences all
  // get swallowed as a name.
  const statedIncompatible = Object.keys(stated).some(
    (key) => key !== "name" && key !== "phone" && key !== "date" && key !== "time",
  );
  const strongNameSignal = nameCurrentlyAsked || Boolean(stated.phone);
  const weakNameSignal = Boolean(stated.date) || Boolean(stated.time);
  // PROVENANCE: a date/time change phrased as a correction is a schedule update, never an identity answer.
  const bareNameBlocked = correctionBlocksBareName(message, stated);
  if (!merged.name && !statedIncompatible && !bareNameBlocked && (strongNameSignal || weakNameSignal)) {
    const withoutPhone = message.replace(PHONE_SUBSTRING_RE, " ").replace(/,/g, " ");
    const remainder = stripCorrectionLanguage(stripRecognizedDateTime(withoutPhone)).trim();
    const candidateOk = strongNameSignal
      ? looksLikeBareName(remainder)
      : looksLikeBareNameStrict(remainder);
    if (candidateOk) {
      const alreadySet = incomingState.name !== undefined;
      if (!alreadySet || hasCorrectionMarker) merged.name = titleCase(remainder);
    }
  }

  // Remember a bare hour ("9") so a later lone "am"/"pm" reply can
  // complete it — see the check at the top of this function. Only
  // attempted while time is still genuinely outstanding for this flow.
  let newBareHourCaptured = false;
  if (missingFields(merged).includes("time")) {
    const bareHour = parseBareHour(message);
    if (bareHour) {
      merged.pendingBareTime = encodeBareTime(bareHour);
      newBareHourCaptured = true;
    }
  } else {
    delete merged.pendingBareTime;
  }

  // Item 5 — unknown-phrase learning foundation: a field was actively
  // being asked for (missingFields(incomingState) was non-empty going
  // into this turn) and this message added NOTHING at all toward it —
  // no field extracted, no bare hour, no bare-name fallback capture.
  // Recorded purely for future human review, same as the top-level
  // "unknown intent" case in generateResponse — never read back to
  // change this turn's own behavior.
  const stillMissingBefore = missingFields(incomingState);
  const madeNoProgress =
    stillMissingBefore.length > 0 &&
    Object.keys(stated).length === 0 &&
    !newBareHourCaptured &&
    merged.name === incomingState.name;
  const unclearPhraseObservation = madeNoProgress
    ? {
        phrase: truncatePhrase(message),
        reason: `no recognized field found while "${stillMissingBefore[0]}" was being asked for`,
        context: `intent=${incomingState.intent ?? "none"}; nextRequiredField=${stillMissingBefore[0]}`,
        outcome: "asked_for_clarification",
      }
    : undefined;

  const result = finishFlowTurn(business, merged, checkAvailability);

  // Item 13: a bare month mention ("actually start in October" — no
  // day) genuinely can't produce a date (resolveDateWord/
  // resolveCalendarDateWord correctly require a day, never guessing
  // one), but silently falling through to the generic "what day works
  // for you?" question gives no sign the month was heard at all.
  // Overridden only when `date` is STILL what's missing after this
  // turn — never touches any other reply (a rejection, a confirmation,
  // a completion).
  const bareMonth = !merged.date ? detectBareMonthMention(message) : undefined;
  const withBareMonthPrompt = bareMonth
    ? { ...result, reply: `Got it — ${bareMonth}. Which day in ${bareMonth} would you like?` }
    : result;

  return unclearPhraseObservation ? { ...withBareMonthPrompt, unclearPhraseObservation } : withBareMonthPrompt;
}

function askForField(flow: BookingIntent, missing: (keyof BookingState)[]): string {
  const next = missing[0];

  if (next === "date" && missing.includes("time")) {
    return flow === "reschedule_appointment"
      ? "What new day and time would you like to move it to?"
      : "What day and time works best for you?";
  }
  if (next === "name" && missing.includes("phone")) {
    return flow === "cancel_appointment"
      ? "Could I get your name and phone number, so I can flag the right appointment?"
      : "Could I get your name and phone number?";
  }

  switch (next) {
    case "service":
      return "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?";
    case "date":
      return flow === "reschedule_appointment"
        ? "What new day would you like to move it to?"
        : "What day works best for you?";
    case "time":
      return "And what time? (please include am/pm)";
    case "name":
      return "Could I get your name?";
    case "phone":
      return "And the best phone number to reach you?";
    default:
      return "Could you tell me a bit more?";
  }
}

/** Clears only date/time from a rejected-time BookingState — service,
 * name, and phone (whatever was already known) are preserved so the
 * customer never has to repeat them after picking a new time. */
function rejectTime(state: BookingState, reply: string): AIProviderResponse {
  const { date: _date, time: _time, pendingBareTime: _pendingBareTime, ...preserved } = state;
  return { reply, actions: [], bookingState: preserved };
}

/** Clears only `time` from an unavailable-slot BookingState — service,
 * date, name, and phone (whatever was already known) are preserved, since
 * the day itself is fine; only this specific time is already taken. */
function rejectAvailability(state: BookingState, reply: string): AIProviderResponse {
  const { time: _time, pendingBareTime: _pendingBareTime, ...preserved } = state;
  return { reply, actions: [], bookingState: preserved };
}

function completeFlow(
  business: BusinessContext,
  flow: BookingIntent,
  state: BookingState,
  checkAvailability: AIProviderRequest["checkAvailability"],
): AIProviderResponse {
  // Once a flow completes, its slate is clear — a fresh, empty
  // BookingState — so the next unrelated message doesn't get treated as
  // still being "inside" a finished booking.
  //
  // This is a redundant safety net, not the primary check: finishFlowTurn
  // already validates hours the moment date+time are both known, well
  // before name/phone are ever asked (see there for the required flow
  // order). By the time stillMissing is empty and completeFlow runs, the
  // time has already passed that check on every intervening turn — this
  // second check exists only so there's no path around validation even
  // if some future change ever reached completeFlow another way (see
  // requirement 9 / the tools-layer backstop in
  // src/tools/receptionist-tools.ts, which independently re-checks again
  // regardless of anything this provider does).
  if (flow === "book_appointment") {
    const validation = validateFlowHours(business, flow, state.date!, state.time!, state.service);
    if (!validation.valid) {
      return rejectTime(state, describeInvalidTime(business, validation, state.date!, state.time!));
    }

    return {
      // Genuine defect found/fixed while building real-date support:
      // this used to interpolate state.date/state.time RAW — harmless
      // (if unpolished) for a weekday name ("Tuesday"/"14:00"), but a
      // real calendar date now makes it read as a literal, broken
      // "2026-09-15" to the customer. buildBookingSummary is the same
      // formatter the confirmation prompt already uses, so the
      // completion message matches it exactly (nicely formatted either
      // way, weekday-name or real date).
      reply: `Perfect — I've captured your request for ${buildBookingSummary(business, state)}. A member of the team would confirm the appointment.`,
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: state.name!,
            phone: state.phone!,
            service: state.service!,
            preferredDate: state.date!,
            preferredTime: state.time!,
          },
        },
      ],
      bookingState: {},
      completingActionReplyIsGeneric: true,
    };
  }

  if (flow === "reschedule_appointment") {
    const validation = validateFlowHours(business, flow, state.date!, state.time!, state.service);
    if (!validation.valid) {
      return rejectTime(state, describeInvalidTime(business, validation, state.date!, state.time!));
    }

    return {
      // Same fix as the booking completion reply above.
      reply: `Got it — I've noted your request to move your appointment to ${buildBookingSummary(business, state)}. Someone from the team will confirm the change.`,
      actions: [
        {
          type: "request_reschedule",
          payload: {
            name: state.name!,
            phone: state.phone!,
            newPreferredDate: state.date!,
            newPreferredTime: state.time!,
          },
        },
      ],
      bookingState: {},
      completingActionReplyIsGeneric: true,
    };
  }

  if (flow === "book_recurring_appointment") {
    // Defensive re-check at the actual commit point — never trust that
    // what was true when the confirmation was presented is still true
    // now (Section 11: revalidate state, then calendar availability,
    // THEN create). checkAvailability being absent here shouldn't
    // happen in practice (presentBookingConfirmation already escalates
    // before ever reaching a "yes" without it), but is handled the same
    // honest way regardless.
    if (!checkAvailability) {
      return {
        reply: composeRecurringUnavailableEscalation(state.service, state.recurrenceIntervalMonths!),
        actions: [
          {
            type: "escalate",
            payload: { reason: "recurring scheduling requested but not safely completable on this backend" },
          },
        ],
        bookingState: {},
      };
    }
    const occurrenceDates = generateOccurrenceDates(
      state.date!,
      state.recurrenceIntervalMonths!,
      RECURRING_OCCURRENCE_COUNT,
    );
    const service = business.services.find((s) => s.name === state.service);
    const durationMinutes = service?.durationMinutes ?? 0;
    const stillAllAvailable = occurrenceDates.every(
      (date) => checkAvailability(date, state.time!, durationMinutes).ok,
    );
    if (!stillAllAvailable) {
      // Never silently create an incomplete series — something changed
      // between the confirmation and this "yes" (a genuine race). Fresh
      // conflict info, not a completion.
      return {
        reply: composeRecurringConfirmationOrConflict(business, state, checkAvailability).reply,
        actions: [],
        bookingState: state,
      };
    }

    const { service: _service, ...dateTimeOnly } = state;
    return {
      reply: `Perfect — I've scheduled a recurring ${state.service} starting ${buildBookingSummary(business, dateTimeOnly)}, repeating every ${state.recurrenceIntervalMonths === 12 ? "year" : `${state.recurrenceIntervalMonths} months`}. A member of the team would confirm the series.`,
      actions: [
        {
          type: "request_recurring_appointment",
          payload: {
            name: state.name!,
            phone: state.phone!,
            service: state.service!,
            startDate: state.date!,
            startTime: state.time!,
            recurrenceIntervalMonths: state.recurrenceIntervalMonths!,
            occurrenceDates,
          },
        },
      ],
      bookingState: {},
      completingActionReplyIsGeneric: true,
    };
  }

  return {
    reply: `Understood — I've flagged ${state.name}'s appointment for cancellation. The team will confirm it's been cancelled.`,
    actions: [
      { type: "request_cancellation", payload: { name: state.name!, phone: state.phone! } },
    ],
    bookingState: {},
    completingActionReplyIsGeneric: true,
  };
}
