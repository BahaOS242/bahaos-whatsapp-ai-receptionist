import type { BookingState, BusinessContext } from "./types";

/**
 * Side questions the deterministic provider can answer HONESTLY from the
 * configured business data — or honestly decline. Each kind either answers
 * from BusinessContext (hours, address, durations, prices) or says plainly
 * that the information is not on file and offers staff help. Nothing here
 * invents policies, amenities, staff names, availability or clinical advice.
 */
export type SideKind =
  | "describe_services"
  | "duration"
  | "directions"
  | "other_times"
  | "unknown_fact"
  | "unsupported_service"
  | "recommendation"
  | "symptom";

export interface SideAnswer {
  kind: SideKind;
  /** The answer text (no trailing booking prompt). */
  answer: string;
  /** For `symptom`: the application starts a consultation offer (assessment only, no diagnosis). */
  startConsultationOffer?: boolean;
}

const DESCRIBE_RE =
  /\bwhat (?:does|do) (?:each|every|all)\b|\bwhat does each one\b|\bexplain (?:each|the|these) (?:one|service)s?\b|\bwhat(?:'s| is) (?:the )?difference\b|\bwhat do (?:they|these|those) (?:do|include|involve|mean)\b|\bwhat'?s included\b/i;
const DURATION_RE =
  /\bhow long\b(?!.*\b(?:open|until|been|have you)\b)|\bhow many minutes\b|\bhow much time\b/i;
const DIRECTIONS_RE =
  /\bdirections?\b|\bhow (?:do|can|would|should) i get (?:there|to (?:you|the (?:clinic|office|place)))\b|\bhow to get there\b/i;
const OTHER_TIMES_RE =
  /\b(?:other|another|different|any other|more|alternative|earlier|later)\s+(?:times?|slots?|options?)\b|\banything\s+(?:else|earlier|later|sooner|available|open)\b|\bwhat times?\s+(?:are|do|is)\b|\bavailable\s+(?:times?|slots?)\b|\bnext availab|\bwhen is the next\b/i;
const UNKNOWN_FACT_RE =
  /\b(?:window|outdoor|patio|booth|corner|quiet)\b.{0,30}\b(?:chair|seat|seating|room|table|space)\b|\b(?:chair|seat|table)\b.{0,20}\b(?:near|by|with a)\b.{0,20}\b(?:window|view|fireplace)\b|\b(?:water |ocean |sunset )?views?\b|\b(?:star|stars|ratings?|reviews?|yelp|google)\b|\bwhat (?:building|hotel)\b|\b(?:accept|take)\s+(?:checks?|cash|cards?|credit|debit|visa|mastercard|payment|apple pay)\b|\bpay(?:ment)?\s+(?:plans?|methods?|options?)\b|\bpay(?:ing)?\s+(?:by|with|in)\s+(?:checks?|cash|cards?)\b|\bdo you (?:take|accept)\b.*\b(?:checks?|cash|cards?)\b|\bparking\b|\bshuttle\b|\b(?:ride|rides|transport(?:ation)?)\b|\bloaner\b|\brental\b|\bwheelchair\b|\baccessib|\bdress code\b|\bwi-?fi\b|\bhigh chair\b|\bbooster\b|\bchild seat\b|\bdiscounts?\b|\bpromotions?\b|\bspecials?\b|\bfinancing\b|\bwhich dentist\b|\bwho(?:'s| is)? (?:the )?(?:dentist|doctor)\b|\bdr\.?\s+[a-z]+/i;
const UNSUPPORTED_SERVICE_RE =
  /\b(?:whiten(?:ing)?|braces|invisalign|aligners?|implants?|dentures?|veneers?|bridges?|extractions?|wisdom (?:teeth|tooth)|x-?rays?|sedation|orthodont\w*|tires?|oil change|brakes?|rotated)\b/i;
const CHEAPEST_RE =
  /\b(?:cheapest|least expensive|lowest price|most affordable|cheap(?:er)? option|under b?\$\s?\d+)\b/i;
const RECOMMEND_RE =
  /\bwhich (?:one|service|treatment)\b.*\b(?:best|good|better|recommend|need|should)\b|\bwhat do you recommend\b|\bwhich do you recommend\b|\bwhat should i (?:get|have|book|do)\b/i;
const SYMPTOM_BODY_RE = /\b(?:tooth|teeth|gums?|jaw|mouth|crown|filling|molar)\b/i;
const SYMPTOM_PROBLEM_RE =
  /\b(?:hurts?|hurting|pain(?:ful)?|ache|aching|sore|sensitive|loose|broken|chipped|cracked|bleed(?:s|ing)?|wrong|problem|issue|toothache|came loose|fell out)\b/i;
const CHECK_REQUEST_RE =
  /\b(?:get|have|want|need|should get)\s+(?:my\s+)?(?:teeth|tooth|mouth)\s+(?:checked|looked at|examined)\b/i;

const FRONT_DESK =
  "I don't have that information on hand, and I won't guess — the front desk can confirm it. I can pass your question to the team if you'd like.";

export function answerSideQuestion(
  business: BusinessContext,
  message: string,
  state: BookingState,
  detectedIntent: string,
  namesService = false,
): SideAnswer | undefined {
  const svc = state.service ? business.services.find((s) => s.name === state.service) : undefined;
  const list = business.services.map((s) => `${s.name} (${s.priceLabel})`).join(", ");

  if (UNSUPPORTED_SERVICE_RE.test(message)) {
    // A loose crown / lost filling is a problem to assess, not an unsupported booking request.
    if (!(SYMPTOM_PROBLEM_RE.test(message) && SYMPTOM_BODY_RE.test(message))) {
      return {
        kind: "unsupported_service",
        answer: `That isn't one of the services I can book here — I can book ${list}. The team can tell you whether they offer it; I can pass your question along.`,
      };
    }
  }
  if (DESCRIBE_RE.test(message)) {
    const lines = business.services
      .map((s) => `${s.name}: about ${s.durationMinutes} minutes, ${s.priceLabel}`)
      .join("; ");
    return {
      kind: "describe_services",
      answer: `Here's what I have on file — ${lines}. I don't have detailed descriptions of each treatment, so the dentist or front desk can explain what each involves.`,
    };
  }
  if (DURATION_RE.test(message)) {
    return {
      kind: "duration",
      answer: svc
        ? `${svc.name} takes about ${svc.durationMinutes} minutes.`
        : `Appointment lengths: ${business.services.map((s) => `${s.name} about ${s.durationMinutes} minutes`).join("; ")}.`,
    };
  }
  if (DIRECTIONS_RE.test(message)) {
    return {
      kind: "directions",
      answer: `We're at ${business.address}. I can't give turn-by-turn directions, but that address should work in a maps app.`,
    };
  }
  if (OTHER_TIMES_RE.test(message) && (state.intent || /appointment|book|time/i.test(message))) {
    return {
      kind: "other_times",
      answer: `I can't see live openings from here, but we're open ${business.hours}. Tell me a day and a time within those hours and I'll set it up.`,
    };
  }
  if (CHEAPEST_RE.test(message)) {
    const cheapest = [...business.services].sort(
      (a, b) => Number(a.priceLabel.replace(/\D/g, "")) - Number(b.priceLabel.replace(/\D/g, "")),
    )[0];
    return {
      kind: "recommendation",
      answer: `The lowest-priced service I can book is ${cheapest.name} at ${cheapest.priceLabel}. Prices for the others: ${business.services
        .filter((s) => s !== cheapest)
        .map((s) => `${s.name} ${s.priceLabel}`)
        .join("; ")}.`,
    };
  }
  if (UNKNOWN_FACT_RE.test(message)) return { kind: "unknown_fact", answer: FRONT_DESK };
  if (RECOMMEND_RE.test(message)) {
    return {
      kind: "recommendation",
      answer: `I can't recommend a treatment over chat — that's for the dentist after an exam. We offer ${list}. A consultation is the usual starting point.`,
    };
  }
  if (detectedIntent === "unknown" && !state.service && !namesService) {
    const symptom = SYMPTOM_BODY_RE.test(message) && SYMPTOM_PROBLEM_RE.test(message);
    if (symptom || CHECK_REQUEST_RE.test(message)) {
      const consult = business.services.find((s) => /consult|exam/i.test(s.name));
      if (consult) {
        return {
          kind: "symptom",
          startConsultationOffer: true,
          answer: `${symptom ? "I'm sorry you're dealing with that. " : ""}I can't diagnose or choose a treatment over chat, but the dentist can assess it — ${consult.name} (${consult.priceLabel}, about ${consult.durationMinutes} minutes). Would you like to book that? If it's severe pain, swelling, bleeding that won't stop or a fever, tell me and I'll flag the team right away.`,
        };
      }
    }
  }
  return undefined;
}
