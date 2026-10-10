import {
  correctionBlocksBareName,
  extractNameContrast,
  hasCorrectionLanguage,
  stripCorrectionLanguage,
} from "./correction-language";
import {
  combineBareTime,
  decodeBareTime,
  encodeBareTime,
  hasTimeQualifier,
  parseBareHour,
  parseBareMeridiem,
  parseTime,
  resolveDateWord,
  stripRecognizedDateTime,
} from "./date-time";
import { extractPhone } from "./phone";
import { analyzeScheduleMessage } from "./schedule-proposal";
import { bareNameValue, extractIntroducedName, isPlausibleBareName } from "./name-provenance";
import { nextRequiredField } from "./booking-progression";
import { isWithinOperatingWindow } from "./business-hours";
import { isSlotAvailable } from "./availability";
import { detectRecurrenceIntervalMonths, isRecurringIntentMessage } from "./recurrence";
import type { BookingIntent, BookingState, BusinessContext, BusinessService } from "./types";

/**
 * Application-owned, deterministic field extraction from the CUSTOMER's
 * raw message — the fix for LLMProvider depending on the model to
 * voluntarily (and reliably) call update_booking_progress. This is a
 * different thing from "re-parsing the model's prose": it only ever reads
 * request.message, the same text a deterministic provider would read,
 * using the exact same narrow, never-guessing utilities
 * (date-time.ts/phone.ts) already trusted elsewhere in this codebase.
 *
 * Every extraction is gated to avoid misreading an unrelated FAQ message
 * as a booking answer (e.g. "are you open Saturdays?" must never become
 * date: "Saturday") — see the field-by-field comments below for exactly
 * what each gate protects against and why it's safe to widen it for an
 * explicit correction.
 */

/** Narrow, explicitly-enumerated correction signal — same "no general
 * dictionary" shape as ESCALATE_RE/AFFIRMATIVE_RE elsewhere in this
 * codebase. Only trusted to permit OVERWRITING an already-known field
 * once an intent is already established (see hasCorrection below) — a
 * stray "actually" before any booking intent exists is far more likely to
 * be unrelated small talk than a correction to something that isn't set
 * yet anyway. */
const CORRECTION_MARKER_RE =
  /\b(actually|instead|i meant|change (that|it) to|correction|scratch that)\b/i;

/** Local, narrow phone-like substring matcher — used only to strip a
 * phone number out of a combined "Trevor 2428012847" message before
 * checking whether what's left looks like a name. Deliberately the same
 * shape as phone.ts's own (private) pattern; not exported from there, so
 * duplicated here rather than reaching into that module's internals. */
const PHONE_LIKE_SUBSTRING_RE = /\+?\d[\d\s().-]{5,}\d/g;

/** Common short words a bare-name candidate must never consist entirely
 * of. Two distinct risks this guards against: leftover connector words
 * that survive stripping recognized date/time text ("Tuesday at 2pm" ->
 * "at"), and a plain yes/no/filler reply ("no", "wait") landing on a turn
 * where name happens to be the next required field — both would otherwise
 * be captured as the customer's name. Deliberately a small, explicit
 * list, not a general stopword dictionary. */
const NON_NAME_WORDS = new Set([
  "at",
  "on",
  "in",
  "to",
  "the",
  "a",
  "an",
  "is",
  "and",
  "or",
  "for",
  "with",
  "yes",
  "yeah",
  "yep",
  "yup",
  "no",
  "nope",
  "nah",
  "sure",
  "ok",
  "okay",
  "wait",
  "stop",
]);

function looksLikeName(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 3) return false;
  if (words.every((word) => NON_NAME_WORDS.has(word.toLowerCase()))) return false;
  return words.every((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word));
}

/** Same abandon/decline phrasing DevRuleBasedAIProvider's own ABANDON_RE
 * guards against, checked BEFORE the cancel pattern below for the same
 * reason it exists there: "cancel that" (declining whatever's just been
 * discussed) must never be mistaken for "cancel my appointment" (a real
 * cancel_appointment intent) — see dev-rule-based-provider.ts's ABANDON_RE
 * (kept as a small, separate local copy rather than importing from that
 * file, which stays fully untouched). */
const ABANDON_RE =
  /\bnever\s*mind\b|\bforget it\b|\bleave it\b|\bcancel (that|this)\b|\bi'?m done\b|\bi'?m out\b|\bdon'?t want (it|to book|that)\b|\bnot interested\b/i;

const CANCEL_RE = /\bcancel\b|\bcan'?t make it\b/i;
/** Genuine bug found live: "can i change my appointment" fell through to
 * BOOK_RE (which matches the bare word "appointment") and was
 * deterministically misclassified as a NEW booking request instead of a
 * reschedule — checked BEFORE BOOK_RE below, but that only helps once
 * this pattern itself recognizes the phrasing. Widened past "resched*"/
 * "move my appointment" to also cover the equally common "change/update/
 * modify (my) appointment/booking" phrasing, without widening so far that
 * an unrelated "change" mid-flow (already handled by CORRECTION_MARKER_RE
 * once an intent exists) gets swept in here too — this is only ever
 * consulted by detectStatedIntent while NO intent is set yet. */
const RESCHEDULE_RE =
  /\bresched|\bmove my appointment\b|\b(change|update|modify)\s+(my\s+)?(appointment|booking)\b/i;
const BOOK_RE = /\bbook\b|\bschedule\b|\bappointment\b/i;

/** Deliberately narrow and anchored to the start of the message — matches
 * the same "safe, explicitly-enumerated, no general dictionary" approach
 * as ESCALATE_RE/EMERGENCY_RE elsewhere. Moved here (from llm-provider.ts)
 * so the pendingCorrection early-branch below — application-owned
 * extraction, not model-facing logic — can use the exact same yes/no
 * vocabulary LLMProvider already trusts for its own auto-confirm/decline
 * bypasses, rather than maintaining a second, driftable copy. */
export const AFFIRMATIVE_RE = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|go ahead|please do|sounds good)\b/i;

/** Mirror image of AFFIRMATIVE_RE — same narrow, anchored, explicitly-
 * enumerated shape. Anchored to the start of the message so "I know that
 * works" (contains "no" mid-word, and doesn't even start with it) can
 * never match. */
export const NEGATIVE_RE =
  /^\s*(no|nope|nah|don'?t book( it)?|do not book( it)?|wait|stop|hold on|cancel that|never\s*mind|not yet|not now)\b/i;

/** Narrow, explicit lead-in phrases that, ONLY combined with a mentioned
 * service (see detectStatedIntent's `serviceMentioned` argument), imply
 * booking intent even without the word "book"/"schedule"/"appointment" —
 * this is what "I want a cleaning" and "I want a filling" need, both
 * observed live losing intent tracking entirely because they don't
 * contain any BOOK_RE keyword. Deliberately NOT trusted on its own
 * (without a service mention) — "I want" alone is too generic and would
 * misfire on unrelated small talk. Mirrors DevRuleBasedAIProvider's own
 * default-branch fallback (dev-rule-based-provider.ts: a bare service
 * mention with no other recognized intent infers book_appointment) but
 * narrower — that fallback fires on ANY service mention, including a
 * plain price/FAQ question ("how much is a cleaning?"), which would be a
 * new false-positive class for LLMProvider (nudging a customer who only
 * asked a price question toward "what date/time works?"). Requiring an
 * explicit lead-in phrase avoids that risk while still covering the
 * phrasing actually observed failing. */
const BOOKING_LEAD_IN_RE =
  /\b(i want|i'd like|i would like|i need|can i get|could i get|book me|get me)\b/i;

/** Deterministic booking-intent detection from the customer's raw
 * message — mirrors DevRuleBasedAIProvider's own well-tested
 * cancel/reschedule/book keyword patterns (detectIntent in
 * dev-rule-based-provider.ts), reused here as the fix for LLMProvider
 * depending on the model to voluntarily call update_booking_progress
 * before the application can recognize a booking request at all (see the
 * Anthropic evaluation: a model that skips that tool call left intent
 * unset for the rest of the conversation, which cascaded into date/time
 * extraction never engaging since it's gated on nextRequiredField).
 * `serviceMentioned` (computed once by the caller — see
 * extractStatedFields) feeds the BOOKING_LEAD_IN_RE fallback above.
 *
 * Deliberately scoped to FIRST detection only — see extractStatedFields,
 * which only calls this while `currentState.intent` is unset. Switching
 * an ALREADY-active intent mid-conversation ("actually let's reschedule
 * instead") still goes through the model's own update_booking_progress
 * report (reportedIntent in llm-provider.ts), unchanged — that's a
 * judgment call keyword-matching alone isn't confidently narrow enough
 * for, so it's intentionally left as-is rather than expanded here. */
function detectStatedIntent(message: string, serviceMentioned: boolean): BookingIntent | undefined {
  if (ABANDON_RE.test(message)) return undefined;
  if (CANCEL_RE.test(message)) return "cancel_appointment";
  if (RESCHEDULE_RE.test(message)) return "reschedule_appointment";
  // Checked BEFORE plain BOOK_RE — Section 5's own examples ("Book me
  // every six months," "Schedule this every year") mix an ordinary
  // book/schedule keyword with an explicit recurrence interval; the
  // recurrence must win so this resolves to the distinct
  // book_recurring_appointment intent, not plain book_appointment.
  if (isRecurringIntentMessage(message)) return "book_recurring_appointment";
  if (BOOK_RE.test(message)) return "book_appointment";
  if (serviceMentioned && BOOKING_LEAD_IN_RE.test(message)) return "book_appointment";
  return undefined;
}

/** Recognizes a correction arriving on the very next turn after a
 * completion ("actually, Wednesday instead" / "actually make it 3pm not
 * 2pm") and deterministically converts it into the start of a
 * reschedule_appointment flow — the fix for a root cause traced live
 * (Anthropic evaluation, Scenarios 4/5): bookingJustCompleted alone
 * proved nothing survives a completion except the flag itself, so a
 * correction message had no intent to attach to (hasCorrection requires
 * an already-active intent) and nowhere to put a new date/time even if it
 * did — the correction was silently swallowed.
 *
 * lastCompletedBooking (set alongside bookingJustCompleted — see
 * llm-provider.ts's deriveBookingState) supplies the name/phone a
 * request_reschedule needs, plus the ORIGINAL date/time as the default
 * for whichever of the two the customer does NOT restate — "actually,
 * Wednesday instead" keeps the original time; "actually make it 3pm not
 * 2pm" keeps the original date. Mirrors exactly how an ordinary mid-flow
 * correction only overwrites the field actually restated.
 *
 * Deliberately narrow: only fires while bookingJustCompleted is armed AND
 * no intent has been re-established yet (checked the same way the
 * duplicate-booking guard is — see llm-provider.ts), only on an explicit
 * correction marker or "reschedule" keyword (never a bare, ambiguous
 * message), and only when the message ALSO states a recognizable new
 * date or time — a correction with nothing concrete to change to isn't
 * trusted to open a whole new flow. */
function detectPostCompletionReschedule(
  business: BusinessContext,
  currentState: BookingState,
  message: string,
): Partial<BookingState> | undefined {
  if (!currentState.bookingJustCompleted || currentState.intent) return undefined;
  const snapshot = currentState.lastCompletedBooking;
  if (!snapshot) return undefined;
  if (!CORRECTION_MARKER_RE.test(message) && !RESCHEDULE_RE.test(message)) return undefined;

  // Checked against the MESSAGE itself, not the merged/fallback result —
  // "actually never mind" also contains a correction marker but states no
  // new date/time at all; falling back to the snapshot's OWN date/time
  // would make `date`/`time` below non-empty regardless, defeating this
  // guard entirely. Only a message that itself states something concrete
  // opens the reschedule flow; snapshot values are used purely to fill in
  // whichever one field ("just the time", "just the date") wasn't restated.
  const messageDate = resolveDateWord(message, new Date(), business.timezone);
  const messageTime = parseTime(message);
  if (!messageDate && !messageTime) return undefined;

  const date = messageDate ?? snapshot.date;
  const time = messageTime ?? snapshot.time;

  return {
    intent: "reschedule_appointment",
    name: snapshot.name,
    phone: snapshot.phone,
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
  };
}

/** Matches the full service name first ("Routine cleaning"), falling back
 * to ANY significant word within it (not just the last — "consultation"
 * for "Dental consultation / basic exam", not only "exam") so a casual
 * mention ("book a consultation") still resolves — genuine gap found
 * during Final V1 Hardening: the last-word-only fallback meant
 * "consultation" alone, arguably the most natural way to say it, was
 * never recognized at all. Safe to widen past "just the last word" only
 * because of the ambiguity guard below: if a shared word ("basic," in
 * both "Dental consultation / basic exam" and "Basic filling") matches
 * more than one service, that's correctly treated as ambiguous rather
 * than guessed — the SAME protection that already made the multi-service
 * exact-name case safe. Mirrors DevRuleBasedAIProvider's own findService
 * (kept as a small, separate local copy rather than importing from that
 * file, which stays fully untouched). */
function findService(business: BusinessContext, text: string): BusinessService | undefined {
  const lower = text.toLowerCase();
  const exactMatches = business.services.filter((s) => lower.includes(s.name.toLowerCase()));
  // Genuine bug found live during the Context & Human Conversation Pass:
  // "should I get a cleaning or a filling?" used to silently resolve to
  // whichever service happened to come first in business.services (an
  // accident of array order, not the customer's choice) — an FAQ-style
  // question naming TWO services isn't "the customer chose one," and
  // guessing which is exactly what item 4's "do NOT guess" rule exists
  // to prevent. More than one match is genuinely ambiguous: report
  // nothing rather than pick an arbitrary winner.
  if (exactMatches.length > 1) return undefined;
  if (exactMatches.length === 1) return exactMatches[0];

  // Word-BOUNDARY matching, not substring — genuine bug found immediately
  // after widening past "last word only": plain `.includes()` matched
  // "basic" inside "basically" ("um so basically I guess I want a
  // cleaning" — a real eval scenario), turning an unrelated filler word
  // into a false, ambiguity-triggering service match. `\bword\b` doesn't.
  const wordMatches = business.services.filter((s) =>
    s.name
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.length > 3 && word !== "dental" && new RegExp(`\\b${word}\\b`).test(lower)), // "dental" is the whole clinic, not a service
  );
  if (wordMatches.length > 1) return undefined;
  return wordMatches[0];
}

/** Extracts whatever the application can safely determine from `message`
 * given `currentState`, WITHOUT depending on the model reporting anything.
 * Returns only the fields it found — callers merge this over previous
 * state, never the reverse (an extraction here is always meant to win). */
export function extractStatedFields(
  business: BusinessContext,
  message: string,
  currentState: BookingState,
): Partial<BookingState> {
  // Early exit: a correction right after a completion is a fundamentally
  // different case from everything below (which all assumes an ALREADY-
  // active intent to extract fields against) — see
  // detectPostCompletionReschedule's own docstring.
  const postCompletionReschedule = detectPostCompletionReschedule(business, currentState, message);
  if (postCompletionReschedule) return postCompletionReschedule;

  // Pending time correction ("Did you mean 2 PM instead?") — an explicit
  // yes/no answers THIS specific proposal, never a generic booking
  // confirmation (pendingAction is never "confirm_service" while this is
  // armed — see llm-provider.ts's proposal site). Checked before
  // everything else, same "consumed unconditionally, own early return"
  // shape as the bare-hour-meridiem case below. A message that's neither
  // yes nor no (e.g. a fresh explicit time) deliberately falls through to
  // ordinary extraction: hasStaleInvalidSlot further down already treats
  // the still-invalid `time` this was proposed for as overridable, so a
  // customer simply stating a different time is handled without any
  // special-casing here.
  if (currentState.pendingCorrection) {
    if (AFFIRMATIVE_RE.test(message)) {
      return { time: currentState.pendingCorrection, pendingCorrection: undefined };
    }
    if (NEGATIVE_RE.test(message)) {
      return { time: undefined, pendingCorrection: undefined };
    }
  }

  // Bare hour + follow-up meridiem ("9" ... "pm" -> 21:00) — mirrors
  // DevRuleBasedAIProvider's identical mechanism (see its own comment at
  // the top of handleFlowTurn); LLMProvider had no deterministic
  // equivalent before this, so a bare "3" (see the mission's own
  // example: "Tuesday," "3," "yes," ...) fell through to the model with
  // no structured time captured at all. Checked before everything else
  // so a lone "am"/"pm" reply is always consumed as completing a
  // previously-stated bare hour, never misread as anything else (an
  // unrelated correction, a stray word, etc.).
  if (!currentState.time && currentState.pendingBareTime) {
    const meridiem = parseBareMeridiem(message);
    if (meridiem) {
      return {
        time: combineBareTime(decodeBareTime(currentState.pendingBareTime), meridiem),
        pendingBareTime: undefined,
        justDeclined: undefined,
      };
    }
  }

  const extracted: Partial<BookingState> = {};

  // `justDeclined` (see its docstring in types.ts) gives the customer's
  // very next word after an explicit decline the SAME license an
  // explicit correction marker already has — overwhelmingly likely to be
  // the correction the decline was ABOUT, even with no "actually"/
  // "instead" wording. Only trusted to permit overwriting an
  // already-set field once a booking is already underway — see
  // CORRECTION_MARKER_RE's comment.
  // Which date/time mention is the PROPOSAL? Rejected mentions ("too early", "busy on Thursday", "11am won't work")
  // are never proposals and clear exactly the stored value they reject; deadlines ("before Wednesday") are not days.
  const schedule = analyzeScheduleMessage(message, currentState);
  const hasCorrection =
    Boolean(currentState.intent) &&
    (CORRECTION_MARKER_RE.test(message) ||
      hasCorrectionLanguage(message) ||
      Boolean(currentState.justDeclined) ||
      schedule.hadRejection);
  // Consumed unconditionally — a one-shot hint for THIS turn only,
  // regardless of what (if anything) it ends up widening below. Every
  // return path from here on must carry this through so it's never left
  // set past the turn it was meant for.
  extracted.justDeclined = undefined;

  // Computed once, up front — reused both by the service extraction below
  // and by detectStatedIntent's lead-in-phrase fallback.
  const mentionedService = findService(business, message);

  // Intent: deterministic, first-detection only — see detectStatedIntent.
  // Deliberately NOT re-checked once already set, even when hasCorrection
  // — switching intent mid-flow ("actually cancel instead") stays
  // model-driven (LLMProvider relies on the model's own
  // update_booking_progress/reportedIntent to report the switch; see
  // llm-provider.ts). This is safe to leave model-driven specifically
  // because it's NOT what protects against a stale completing action —
  // that protection is booking-confirmation.ts's hard gate, which keys
  // off `before.intent` and invalidates any pending confirmation the
  // instant intent changes by ANY means (deterministic or model-
  // reported) — see isConfirmedCompletingAction. Computed before
  // date/time below so a combined message ("book a cleaning for Tuesday
  // 2pm") can resolve intent, service, AND date/time all in the same
  // turn, rather than needing the model to establish intent on a prior
  // turn first.
  if (!currentState.intent) {
    const intent = detectStatedIntent(message, Boolean(mentionedService));
    if (intent) {
      extracted.intent = intent;

      // Genuine bug found live: a bare reschedule request ("can i change
      // my appointment", no date/time in the same breath) established
      // intent === "reschedule_appointment" correctly but then asked for
      // name/phone all over again, even though the customer's just-
      // completed booking already supplied them — detectPostCompletion-
      // Reschedule's own pre-fill only fires when the SAME message also
      // states a concrete new date/time, which a bare "can I change my
      // appointment" never does. Pre-fills name/phone/service — the
      // fields describing the EXISTING appointment, unaffected by a
      // reschedule — from lastCompletedBooking here too, so this general
      // path gets the identical "don't re-ask for what's already known"
      // treatment. Deliberately never pre-fills date/time: those are
      // exactly what's being changed, and must come from the customer
      // fresh, not default to the appointment being replaced.
      if (intent === "reschedule_appointment" && currentState.bookingJustCompleted && currentState.lastCompletedBooking) {
        const snapshot = currentState.lastCompletedBooking;
        if (snapshot.name) extracted.name = snapshot.name;
        if (snapshot.phone) extracted.phone = snapshot.phone;
        if (snapshot.service) extracted.service = snapshot.service;
      }
    }
  }

  // Service: low collision risk (a dental service name is unlikely to
  // appear in unrelated chat), so extracted whenever unset or corrected.
  if (!currentState.service || hasCorrection) {
    if (mentionedService) extracted.service = mentionedService.name;
  }

  // Date/time: gated to "the application is currently asking for this" —
  // resolveDateWord matches bare weekday names and parseTime matches any
  // am/pm-qualified hour, both of which a customer could easily mention
  // while asking an unrelated FAQ ("are you open Saturdays?", "are you
  // open until 5pm?"); only a DIRECT answer to our own question, or an
  // explicit correction once a booking is already underway, is trusted.
  // Computed from currentState merged with whatever's already been
  // extracted above (intent/service), not currentState alone, so this
  // turn's own newly-detected intent/service immediately counts.
  const next = nextRequiredField({ ...currentState, ...extracted });

  // A stored date+time combo that's already known to be invalid — out of
  // hours, a closed day, OR (see the Scenario 7 finding below) a slot
  // that's already held by another appointment — was never actually
  // validated/booked; it's stale, not a confirmed slot, and the SAME
  // "already known" gate that correctly protects a genuinely valid value
  // must not also block a plain restatement of a valid one the way it
  // should for a real correction. Without this, only an explicit
  // "actually"/"instead" could ever overwrite it.
  //
  // Business-hours case: "Tuesday 3pm" after a stray "Tuesday 6pm" was
  // silently ignored (see the Anthropic evaluation).
  //
  // Availability case: after an unavailable-slot rejection offers
  // alternatives ("We do have 9:00 AM... available — would one of those
  // work?"), the customer's bare reply ("9am") is a direct answer to that
  // question, not a fresh correction — but the stored (still held, never
  // actually booked) date+time already look "complete" by field
  // presence, so nextRequiredField already reports nothing missing and
  // pendingAction is already "confirm_service". Without treating the held
  // slot as stale too, "9am" has nowhere to land: it doesn't match
  // AFFIRMATIVE_RE/NEGATIVE_RE, so it reaches the model with a system
  // prompt that STILL shows the old held time as "confirmed" — observed
  // live, the model asked a clarifying question ("are you asking to
  // change your appointment...") instead of recognizing the answer.
  //
  // Requires BOTH date and time already set (mid-flow, only one pending,
  // is already covered by next==="date"/"time" above) and is scoped no
  // more broadly than hasCorrection already is.
  const hasStaleInvalidSlot = Boolean(
    currentState.date &&
    currentState.time &&
    (!isWithinOperatingWindow(business, currentState.date, currentState.time).valid ||
      !isSlotAvailable(business, currentState.date, currentState.time)),
  );

  // A QUALIFIED time ("quarter to 3pm", "not 3pm", "3pm or 4pm", "from 2pm to 4pm") is never resolved to an hour:
  // no time is stored, any existing time is kept but marked unresolved, and the customer is asked for one exact time.
  const timeQualified =
    Boolean(currentState.intent ?? extracted.intent) && hasTimeQualifier(message);
  if (timeQualified) {
    extracted.timeClarification = true;
    if (currentState.pendingBareTime) extracted.pendingBareTime = undefined;
  }

  if (currentState.intent || extracted.intent) {
    if (schedule.clearDate) extracted.date = undefined;
    if (schedule.clearTime) {
      extracted.time = undefined;
      extracted.timeClarification = undefined;
      extracted.pendingBareTime = undefined;
    }
    if (schedule.clearDate || schedule.clearTime) extracted.pendingAction = undefined; // stale approval
  }
  const dateTimeEligible =
    next === "date" ||
    next === "time" ||
    hasCorrection ||
    hasStaleInvalidSlot ||
    Boolean(currentState.timeClarification) ||
    schedule.clearDate ||
    schedule.clearTime ||
    Boolean(currentState.intent && schedule.hasProposalCue);
  if (dateTimeEligible) {
    if (!currentState.date || hasCorrection || hasStaleInvalidSlot || schedule.clearDate || (currentState.intent && schedule.hasProposalCue)) {
      const date = resolveDateWord(schedule.proposalText, new Date(), business.timezone);
      if (date) extracted.date = date;
    }
    if (
      !currentState.time ||
      hasCorrection ||
      hasStaleInvalidSlot ||
      currentState.timeClarification ||
      schedule.clearTime ||
      Boolean(currentState.intent && schedule.hasProposalCue)
    ) {
      const time = parseTime(schedule.proposalText);
      if (time) {
        extracted.time = time;
        extracted.timeClarification = undefined; // one exact time stated: resolved (a fresh confirmation follows)
        // A full time was stated outright — any bare hour remembered
        // from an earlier turn is now stale, never left to misfire on a
        // LATER, unrelated lone "am"/"pm" reply.
        if (currentState.pendingBareTime) extracted.pendingBareTime = undefined;
        // Same staleness reasoning for a pending time correction: the
        // customer just stated a DIFFERENT time outright, not a yes/no
        // answer to what was proposed (that's handled by the early
        // pendingCorrection branch above) — the proposal no longer
        // applies to anything and must never resurface later. Genuine
        // gap found writing this fix's own regression tests: without
        // this, a stale pendingCorrection from an earlier, already-
        // superseded invalid time survived a fresh, valid restatement.
        if (currentState.pendingCorrection) extracted.pendingCorrection = undefined;
      } else {
        // No am/pm-qualified time — see if this is at least a bare hour
        // ("3") to remember for a possible follow-up meridiem reply (see
        // the check at the top of this function). Never fires on a
        // message that already resolved a full time above.
        const bareHour = parseBareHour(schedule.proposalText);
        if (bareHour) extracted.pendingBareTime = encodeBareTime(bareHour);
      }
    }
  }

  // Recurrence interval: same low-collision-risk shape as service/phone
  // — "every 6 months" essentially never appears by coincidence in
  // unrelated chat, so extracted whenever unset or corrected, regardless
  // of what's currently being asked. Section 7's own required scenario
  // ("every 6 months" -> "actually every 3 months") needs this to be
  // overwritable on a correction the same as every other field.
  if (!currentState.recurrenceIntervalMonths || hasCorrection) {
    const interval = detectRecurrenceIntervalMonths(message);
    if (interval) extracted.recurrenceIntervalMonths = interval;
  }

  // Phone: low collision risk (a 7+ digit run essentially never appears
  // by coincidence in ordinary chat), so extracted whenever unset or
  // corrected, regardless of what's currently being asked — this is what
  // lets a customer volunteer it out of order.
  if (!currentState.phone || hasCorrection) {
    const phone = extractPhone(message, business.areaCode);
    if (phone) extracted.phone = phone;
  }

  // Name: only the two patterns DevRuleBasedAIProvider itself trusts
  // most. The unambiguous "my name is X" phrasing is safe anywhere
  // (unset or corrected); a bare name-shaped remainder is only trusted
  // when name is SPECIFICALLY what's being asked right now — never
  // widened by a correction marker, since a short ambiguous phrase like
  // "actually it's Bob" is exactly the kind of false positive that
  // guard exists to prevent.
  // An explicit introduction ("my name is X") is an identity statement in its own right and may
  // replace an earlier name without correction wording.
  const nameContrast = extractNameContrast(message, currentState.name);
  const introduced = extractIntroducedName(message, { nameAsked: next === "name" });
  if (nameContrast) {
    // "It's Alisha, not Alicia": the rejected name equals the one on file, so the correction is explicit.
    extracted.name = nameContrast;
  } else if (introduced && (!currentState.name || hasCorrection || introduced.explicit)) {
    // PROVENANCE: explicit introduction ("my name is X", "put it under X", "it's for my wife, X"), or ambiguous
    // phrasing ("I'm X") only while the name is the field being asked.
    extracted.name = introduced.name;
  } else if (
    !currentState.name &&
    next === "name" &&
    !correctionBlocksBareName(message, extracted)
  ) {
    // (a date/time change phrased as a correction is a schedule update, never an identity answer)
    const withoutPhone = message.replace(PHONE_LIKE_SUBSTRING_RE, " ");
    const remainder = stripCorrectionLanguage(
      stripRecognizedDateTime(withoutPhone).replace(/[,.!?;:]/g, " "),
    ).trim();
    if (looksLikeName(remainder) && isPlausibleBareName(remainder, message))
      extracted.name = bareNameValue(remainder);
  }

  return extracted;
}
