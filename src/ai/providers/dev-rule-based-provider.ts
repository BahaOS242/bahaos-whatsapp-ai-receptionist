import { resolveDateWord, parseTime } from "../date-time";
import { extractPhone } from "../phone";
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
    const { business, message, bookingState } = request;
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

    const flowState = resolveFlowState(intent, bookingState);
    if (flowState) {
      return handleFlowTurn(business, flowState, message);
    }

    switch (intent) {
      case "hours":
        return { reply: `We're open ${business.hours}.`, actions: [], bookingState };
      case "location":
        return { reply: `We're located at ${business.address}.`, actions: [], bookingState };
      case "services": {
        const list = business.services.map((s) => `${s.name} (${s.priceLabel})`).join(", ");
        return {
          reply: `We offer ${list}. Want details on one, or should I help you book?`,
          actions: [],
          bookingState,
        };
      }
      case "insurance":
        return { reply: business.policies.insurance, actions: [], bookingState };
      case "new_patient":
        return { reply: business.policies.newPatientInfo, actions: [], bookingState };
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
          return {
            reply: `Yes — ${svc.name} is ${svc.priceLabel} and takes about ${svc.durationMinutes} minutes. Would you like to book it?`,
            actions: [],
            bookingState,
          };
        }
        return {
          reply:
            "I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?",
          actions: [],
          bookingState,
        };
      }
    }
  }
}

type Intent =
  | "emergency"
  | "escalate"
  | "book"
  | "reschedule"
  | "cancel"
  | "hours"
  | "location"
  | "services"
  | "insurance"
  | "new_patient"
  | "greeting"
  | "thanks"
  | "unknown";

function detectIntent(text: string): Intent {
  if (/\btalk to (a |an )?(human|real person|someone|agent|manager)\b/i.test(text))
    return "escalate";
  if (/\bemergency\b|\bsevere pain\b|\bbroken tooth\b|\btooth (really )?hurts?\b/i.test(text))
    return "emergency";
  if (/\bcancel\b|\bcan'?t make it\b/i.test(text)) return "cancel";
  if (/\bresched/i.test(text) || /\bmove my appointment\b/i.test(text)) return "reschedule";
  if (/\bbook\b|\bschedule\b|\bappointment\b/i.test(text)) return "book";
  if (/\bhours?\b|\bopen\b|\bclose[sd]?\b/i.test(text)) return "hours";
  if (/\bwhere\b|\blocation\b|\baddress\b/i.test(text)) return "location";
  if (/\bservices?\b|\bdo you (do|offer)\b/i.test(text)) return "services";
  if (/\binsurance\b|\bcoverage\b/i.test(text)) return "insurance";
  if (/\bnew patients?\b|\bfirst visit\b/i.test(text)) return "new_patient";
  if (/\bthank(s| you)\b/i.test(text)) return "thanks";
  if (/^\s*(hi|hello|hey)[!.,\s]*$/i.test(text)) return "greeting";
  return "unknown";
}

const INTENT_TO_FLOW: Partial<Record<Intent, BookingIntent>> = {
  book: "book_appointment",
  reschedule: "reschedule_appointment",
  cancel: "cancel_appointment",
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
};

function missingFields(state: BookingState): (keyof BookingState)[] {
  if (!state.intent) return [];
  return REQUIRED_FIELDS[state.intent].filter((field) => !state[field]);
}

const NAME_HINT_RE =
  /\b(my name is|i'?m|this is|it'?s)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)/i;

/** Matches the full service name first ("Routine cleaning"), falling back
 * to its last word ("cleaning") so a casual mention ("book a cleaning")
 * still resolves — a real LLM wouldn't need this crutch, but this is the
 * deterministic fallback provider. */
function findService(business: BusinessContext, text: string) {
  const lower = text.toLowerCase();
  const exact = business.services.find((s) => lower.includes(s.name.toLowerCase()));
  if (exact) return exact;

  return business.services.find((s) => {
    const words = s.name.toLowerCase().split(/\s+/);
    const lastWord = words[words.length - 1];
    return lastWord.length > 3 && lower.includes(lastWord);
  });
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Extracts every field this message states outright, independent of
 * conversation position — service mention, resolvable date word,
 * unambiguous (am/pm-qualified) time, a normalizable phone number, and an
 * explicitly-hinted name ("my name is X"). Nothing here depends on what
 * was asked previously; that's handled separately by the name fallback
 * below, driven by which fields BookingState is still missing. */
function extractStatedFields(business: BusinessContext, text: string): Partial<BookingState> {
  const fields: Partial<BookingState> = {};

  const svc = findService(business, text);
  if (svc) fields.service = svc.name;

  const date = resolveDateWord(text);
  if (date) fields.date = date;

  const time = parseTime(text);
  if (time) fields.time = time;

  const phone = extractPhone(text, business.areaCode);
  if (phone) fields.phone = phone;

  const nameMatch = text.match(NAME_HINT_RE);
  if (nameMatch) fields.name = titleCase(nameMatch[2].trim());

  return fields;
}

/** After stripping out a matched phone-number substring, is what's left a
 * plausible bare name? Used only when BookingState says a name is
 * genuinely still outstanding — i.e. driven by state, not by matching
 * this provider's own prior wording. */
function looksLikeBareName(remainder: string): boolean {
  const candidate = remainder.trim();
  if (!candidate || candidate.length > 40) return false;
  if (/\d/.test(candidate)) return false;
  if (detectIntent(candidate) !== "unknown") return false;
  return true;
}

const PHONE_SUBSTRING_RE = /(\+?\d[\d\s().-]{5,}\d)/;

function handleFlowTurn(
  business: BusinessContext,
  incomingState: BookingState,
  message: string,
): AIProviderResponse {
  // "name" must be the very NEXT field being asked for — not merely
  // somewhere in the missing list — otherwise a message answering an
  // earlier question (e.g. "filling" for service, while name also
  // happens to still be unset) would be wrongly read as a name.
  const nameIsCurrentQuestion = missingFields(incomingState)[0] === "name";
  const stated = extractStatedFields(business, message);
  const merged: BookingState = { ...incomingState, ...stated };

  // Phone commonly arrives in the same message as a name ("Trevor
  // 12428012847") — only service/date/time indicate this message was
  // actually answering a different question.
  const statedAnythingElse = Object.keys(stated).some((key) => key !== "name" && key !== "phone");
  if (!merged.name && nameIsCurrentQuestion && !statedAnythingElse) {
    const remainder = message.replace(PHONE_SUBSTRING_RE, " ").replace(/,/g, " ").trim();
    if (looksLikeBareName(remainder)) merged.name = titleCase(remainder);
  }

  const flow = merged.intent!;
  const stillMissing = missingFields(merged);

  if (stillMissing.length === 0) {
    return completeFlow(flow, merged);
  }

  return { reply: askForField(flow, stillMissing), actions: [], bookingState: merged };
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

function completeFlow(flow: BookingIntent, state: BookingState): AIProviderResponse {
  // Once a flow completes, its slate is clear — a fresh, empty
  // BookingState — so the next unrelated message doesn't get treated as
  // still being "inside" a finished booking.
  if (flow === "book_appointment") {
    return {
      reply: `Perfect — I've captured your request for ${state.service} on ${state.date} at ${state.time}. A member of the team would confirm the appointment.`,
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
    };
  }

  if (flow === "reschedule_appointment") {
    return {
      reply: `Got it — I've noted your request to move your appointment to ${state.date} at ${state.time}. Someone from the team will confirm the change.`,
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
    };
  }

  return {
    reply: `Understood — I've flagged ${state.name}'s appointment for cancellation. The team will confirm it's been cancelled.`,
    actions: [
      { type: "request_cancellation", payload: { name: state.name!, phone: state.phone! } },
    ],
    bookingState: {},
  };
}
