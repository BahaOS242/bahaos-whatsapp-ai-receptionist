import { describe, expect, it } from "vitest";
import { extractStatedFields } from "../../src/ai/message-field-extraction";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { HELD_SLOT_BUSINESS } from "./fixtures/deterministic-scenarios";
import type { BookingState } from "../../src/ai/types";

describe("extractStatedFields — intent (REGRESSION: deterministic, model-independent)", () => {
  // Live finding (Anthropic evaluation): claude-haiku-4-5-20251001 called
  // update_booking_progress on some opening messages but not others
  // ("I'd like to book an appointment" vs. "I want to book something" /
  // "I want a cleaning") despite near-identical intent. Since intent
  // gated nextRequiredField, a skipped tool call stalled date/time
  // extraction for the entire rest of the conversation even though the
  // customer stated everything clearly. This is the fix: the application
  // itself recognizes booking intent from the raw message, so a single
  // missed tool call can no longer cascade into a stalled conversation.
  it("recognizes 'book an appointment' without any model involvement", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I'd like to book an appointment", {});
    expect(extracted.intent).toBe("book_appointment");
  });

  it("recognizes the exact phrasing that caused the live miss ('I want to book something')", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I want to book something", {});
    expect(extracted.intent).toBe("book_appointment");
  });

  it("recognizes 'I want a cleaning' via the lead-in-phrase + service-mention fallback (no book/schedule/appointment keyword present)", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I want a cleaning", {});
    expect(extracted.intent).toBe("book_appointment");
    expect(extracted.service).toBe("Routine cleaning");
  });

  it("recognizes 'I want a filling' (the other live-failing opener)", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I want a filling", {});
    expect(extracted.intent).toBe("book_appointment");
    expect(extracted.service).toBe("Basic filling");
  });

  it("does NOT infer booking intent from a bare service mention with no lead-in phrase (avoids nudging a price/FAQ question toward booking)", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "how much is a cleaning?", {});
    expect(extracted.intent).toBeUndefined();
  });

  it("recognizes 'reschedule' phrasing", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I need to reschedule my appointment", {});
    expect(extracted.intent).toBe("reschedule_appointment");
  });

  it("recognizes 'cancel' phrasing", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I need to cancel my appointment", {});
    expect(extracted.intent).toBe("cancel_appointment");
  });

  it("does NOT mistake 'cancel that' (abandoning the current request) for a real cancel_appointment intent", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "cancel that", {});
    expect(extracted.intent).toBeUndefined();
  });

  it("does not re-detect or override an already-active intent — switching stays model-driven", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "actually let's cancel instead", {
      intent: "book_appointment",
      service: "Routine cleaning",
    });
    expect(extracted.intent).toBeUndefined();
  });

  it("a combined message resolves intent AND service in the same turn", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I'd like to book a cleaning", {});
    expect(extracted.intent).toBe("book_appointment");
    expect(extracted.service).toBe("Routine cleaning");
  });

  it("a combined message resolves intent, service, AND date/time in the same turn", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "book a cleaning for Tuesday 2pm",
      {},
    );
    expect(extracted.intent).toBe("book_appointment");
    expect(extracted.service).toBe("Routine cleaning");
    expect(extracted.date).toBe("Tuesday");
    expect(extracted.time).toBe("14:00");
  });

  it("an unrelated FAQ message does not falsely trigger intent detection", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "what are your hours?", {});
    expect(extracted.intent).toBeUndefined();
  });
});

describe("extractStatedFields — service", () => {
  it("extracts a service by exact name match when unset", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "I'd like a routine cleaning please",
      {},
    );
    expect(extracted.service).toBe("Routine cleaning");
  });

  it("extracts a service by casual last-word mention", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "book a cleaning", {});
    expect(extracted.service).toBe("Routine cleaning");
  });

  it("does not re-extract once service is already known", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "I also mentioned a filling", {
      intent: "book_appointment",
      service: "Routine cleaning",
    });
    expect(extracted.service).toBeUndefined();
  });

  it("allows overwriting service on an explicit correction once intent is established", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "actually I want a filling instead",
      { intent: "book_appointment", service: "Routine cleaning" },
    );
    expect(extracted.service).toBe("Basic filling");
  });

  it("a correction marker before any intent is established does not enable overwriting (nothing to correct yet)", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "actually never mind", {});
    expect(extracted.service).toBeUndefined();
  });

  // Genuine bug found live during the Context & Human Conversation Pass:
  // "should I get a cleaning or a filling?" used to silently resolve to
  // "Routine cleaning" — not because the customer chose it, but purely
  // because it comes first in BAHAMAS_DENTAL_SERVICE.services. That
  // guessed value then blocked a LATER, genuine, unambiguous choice
  // ("let's go with the filling") from ever being extracted at all,
  // since the field already looked "set." Item 4's explicit rule: never
  // guess when genuinely unclear.
  it("REGRESSION: a message naming TWO services is ambiguous — extracts nothing rather than guessing one", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "should I get a cleaning or a filling?",
      {},
    );
    expect(extracted.service).toBeUndefined();
  });

  it("REGRESSION: an unambiguous choice made AFTER an ambiguous mention is still extracted correctly", () => {
    const first = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "should I get a cleaning or a filling?", {});
    expect(first.service).toBeUndefined();

    const second = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "let's go with the filling", {
      intent: "book_appointment",
    });
    expect(second.service).toBe("Basic filling");
  });

  it("a message naming three services (via the casual last-word fallback) is still ambiguous, not just the two-exact-name case", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "what's the difference between a cleaning and a filling and an exam?",
      {},
    );
    expect(extracted.service).toBeUndefined();
  });
});

describe("extractStatedFields — date/time (FAQ-safety gated)", () => {
  const AFTER_SERVICE: BookingState = { intent: "book_appointment", service: "Routine cleaning" };
  const AWAITING_TIME: BookingState = { ...AFTER_SERVICE, date: "Tuesday" };

  it("extracts date and time when that's the next required field", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Tuesday 2pm", AFTER_SERVICE);
    expect(extracted.date).toBe("Tuesday");
    expect(extracted.time).toBe("14:00");
  });

  it("extracts only time when date is already known and time is next", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "2pm works", AWAITING_TIME);
    expect(extracted.date).toBeUndefined();
    expect(extracted.time).toBe("14:00");
  });

  it("does NOT extract a date from an FAQ question mentioning a weekday before any intent exists", () => {
    // The exact false-positive risk this gating exists to prevent.
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "are you open Saturdays?", {});
    expect(extracted.date).toBeUndefined();
  });

  it("does NOT extract a time from an FAQ question mentioning an hour while name is the next required field", () => {
    const midFlow: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
    };
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "by the way are you open until 5pm?",
      midFlow,
    );
    expect(extracted.time).toBeUndefined();
  });

  it("an explicit correction ('actually Wednesday instead') overwrites an already-known date once intent is established", () => {
    const complete: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    };
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "actually Wednesday instead",
      complete,
    );
    expect(extracted.date).toBe("Wednesday");
  });
});

describe("extractStatedFields — REGRESSION: a stale invalid time doesn't block a later valid one", () => {
  // Live finding (Anthropic evaluation): "Tuesday 6pm" deterministically
  // extracts date: "Tuesday", time: "18:00" (out of hours) — but since no
  // request_appointment was ever actually attempted that turn (the model
  // just answered conversationally), nothing ever ran the hours check that
  // would normally clear an invalid time. The customer's plain restatement
  // ("Tuesday 3pm", no "actually"/"instead") was then silently ignored,
  // because date/time were already "known" as far as the existing-value
  // gate could tell — even though that value had never actually been
  // validated as bookable.
  const STALE_INVALID_TIME: BookingState = {
    intent: "book_appointment",
    service: "Basic filling",
    date: "Tuesday",
    time: "18:00", // outside Tuesday's 09:00–17:00 hours
  };

  it("a plain restatement (no correction marker) overwrites a stale out-of-hours time", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Tuesday 3pm", STALE_INVALID_TIME);
    expect(extracted.date).toBe("Tuesday");
    expect(extracted.time).toBe("15:00");
  });

  it("a plain restatement of just the time (date already valid-looking) still overwrites the stale time", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "3pm works", STALE_INVALID_TIME);
    expect(extracted.time).toBe("15:00");
  });

  it("a stale invalid DATE (closed day) is also overwritable by a plain restatement", () => {
    const staleClosedDay: BookingState = {
      intent: "book_appointment",
      service: "Basic filling",
      date: "Sunday", // BAHAMAS_DENTAL_SERVICE is closed Sundays
      time: "10:00",
    };
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "how about Monday 10am", staleClosedDay);
    expect(extracted.date).toBe("Monday");
    expect(extracted.time).toBe("10:00");
  });

  it("PRESERVED PROTECTION: a genuinely VALID already-known time is NOT overwritten by an unrelated FAQ mention, exactly as before", () => {
    const validState: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00", // within hours — a real, confirmed-looking value
    };
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "by the way are you open until 5pm?",
      validState,
    );
    expect(extracted.time).toBeUndefined();
    expect(extracted.date).toBeUndefined();
  });

  it("PRESERVED PROTECTION: a stale invalid time does not turn an FAQ into a false date extraction unless the FAQ itself states a recognizable date/time", () => {
    // The staleness gate only widens WHAT'S ALLOWED to be captured
    // (permits overwriting), it never invents a date/time that isn't
    // actually in the message.
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "what's your cancellation policy?",
      STALE_INVALID_TIME,
    );
    expect(extracted.date).toBeUndefined();
    expect(extracted.time).toBeUndefined();
  });
});

describe("extractStatedFields — REGRESSION (Scenario 7): a held/unavailable slot doesn't block recognizing the customer's chosen alternative", () => {
  // Live finding (Anthropic evaluation, Scenario 7): after an unavailable-
  // slot rejection offers alternatives ("We do have 9:00 AM... would one
  // of those work?"), the stored date+time (the HELD 14:00, never
  // actually booked) still looks "complete" by field presence alone —
  // nextRequiredField reports nothing missing, pendingAction is already
  // "confirm_service". The customer's bare reply to that question ("9am")
  // has nowhere to land: it isn't a correction marker, and the field is
  // already "known" as far as the old gate could tell. Observed live,
  // this left the model asking a clarifying question instead of
  // completing the booking. HELD_SLOT_BUSINESS (imported from the shared
  // scenario corpus) has Tuesday 14:00 already held.
  const HELD_SLOT_STATE: BookingState = {
    intent: "book_appointment",
    service: "Routine cleaning",
    date: "Tuesday",
    time: "14:00", // held — see HELD_SLOT_BUSINESS.unavailableSlots
    name: "Trevor",
    phone: "+12428012847",
  };

  it("a bare reply naming the offered alternative ('9am') overwrites the held time with no correction marker needed", () => {
    const extracted = extractStatedFields(HELD_SLOT_BUSINESS, "9am", HELD_SLOT_STATE);
    expect(extracted.time).toBe("09:00");
    expect(extracted.date).toBeUndefined(); // date itself was never the problem — only overwritten if restated
  });

  it("a full restatement ('Tuesday 9am') also overwrites both date and time", () => {
    const extracted = extractStatedFields(HELD_SLOT_BUSINESS, "Tuesday 9am", HELD_SLOT_STATE);
    expect(extracted.date).toBe("Tuesday");
    expect(extracted.time).toBe("09:00");
  });

  it("PRESERVED PROTECTION: an AVAILABLE already-known time is NOT overwritten by an unrelated FAQ mention", () => {
    const availableState: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "09:00", // not held under HELD_SLOT_BUSINESS
    };
    const extracted = extractStatedFields(
      HELD_SLOT_BUSINESS,
      "by the way, are you open until 5pm?",
      availableState,
    );
    expect(extracted.time).toBeUndefined();
    expect(extracted.date).toBeUndefined();
  });

  it("PRESERVED PROTECTION: under the default (no held slots) business, the same message never triggers staleness at all", () => {
    // Sanity check that this fix is specifically about held slots, not a
    // general widening — BAHAMAS_DENTAL_SERVICE has no unavailableSlots.
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "9am",
      { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday", time: "14:00" },
    );
    expect(extracted.time).toBeUndefined();
  });
});

describe("extractStatedFields — phone", () => {
  it("extracts and normalizes a phone number whenever unset, regardless of what's currently being asked", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "you can reach me at 2428012847",
      {
        intent: "book_appointment",
        service: "Routine cleaning",
      },
    );
    expect(extracted.phone).toBe("+12428012847");
  });

  it("does not re-extract once phone is already known", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "my number is 2428019999", {
      phone: "+12428012847",
    });
    expect(extracted.phone).toBeUndefined();
  });
});

describe("extractStatedFields — name", () => {
  it('trusts the unambiguous "my name is X" phrasing anywhere', () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "hi, my name is Trevor", {});
    expect(extracted.name).toBe("Trevor");
  });

  it("captures a bare name-shaped reply only when name is specifically what's being asked", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Trevor", {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
    });
    expect(extracted.name).toBe("Trevor");
  });

  it("does NOT capture a bare reply as a name when name isn't currently being asked", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Trevor", {
      intent: "book_appointment",
      service: "Routine cleaning",
    });
    expect(extracted.name).toBeUndefined();
  });

  it("captures name AND phone together from a combined reply", () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
    };
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Trevor, 2428012847", state);
    expect(extracted.name).toBe("Trevor");
    expect(extracted.phone).toBe("+12428012847");
  });

  it("does not mistake leftover connector text after stripping a date/time answer for a name", () => {
    // "Tuesday at 2pm" with name as the next field strips to "at" — must
    // not be captured as the customer's name.
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Tuesday at 2pm", {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
    });
    expect(extracted.name).toBeUndefined();
  });

  it("does not mistake a plain 'no' (declining a confirmation) for a name", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "no", {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
    });
    expect(extracted.name).toBeUndefined();
  });

  it("does not re-extract once name is already known", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Sarah", {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
    });
    expect(extracted.name).toBeUndefined();
  });
});

describe("extractStatedFields — REGRESSION (Scenarios 4/5): post-completion correction converts to a reschedule flow", () => {
  // Root cause traced live (Anthropic evaluation): a completing action
  // resets bookingState to {bookingJustCompleted: true} — nothing else.
  // A correction on the very next turn ("actually, Wednesday instead")
  // had no intent to attach to (hasCorrection requires an already-active
  // intent) and no identifying info to build a reschedule from even if it
  // did. lastCompletedBooking (set alongside bookingJustCompleted) fixes
  // this by carrying forward what was actually booked.
  const JUST_COMPLETED: BookingState = {
    bookingJustCompleted: true,
    lastCompletedBooking: {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    },
  };

  it("a date-only correction ('actually Wednesday instead') starts a reschedule flow, keeping the original time", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "actually can we do Wednesday instead",
      JUST_COMPLETED,
    );
    expect(extracted).toEqual({
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      date: "Wednesday",
      time: "14:00", // carried over from lastCompletedBooking, not restated
    });
  });

  it("a time-only correction ('actually make it 3pm not 2pm') starts a reschedule flow, keeping the original date", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "actually make it 3pm not 2pm",
      JUST_COMPLETED,
    );
    expect(extracted).toEqual({
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      date: "Tuesday", // carried over from lastCompletedBooking, not restated
      time: "15:00",
    });
  });

  it("an explicit 'reschedule' request (no correction marker) also starts the flow", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "I need to reschedule to Friday 10am",
      JUST_COMPLETED,
    );
    expect(extracted).toEqual({
      intent: "reschedule_appointment",
      name: "Trevor",
      phone: "+12428012847",
      date: "Friday",
      time: "10:00",
    });
  });

  it("does NOT fire without a correction marker or 'reschedule' keyword — a bare restatement is too ambiguous to act on", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "Wednesday works better", JUST_COMPLETED);
    expect(extracted).toEqual({});
  });

  it("does NOT fire when the correction marker is present but the message states no concrete new date/time ('actually never mind')", () => {
    // The critical guard: falling back to lastCompletedBooking's OWN
    // date/time here would make this fire on ANY correction-marker
    // message regardless of content — this proves it doesn't.
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "actually never mind", JUST_COMPLETED);
    expect(extracted).toEqual({});
  });

  it("does NOT fire when bookingJustCompleted is not set (an ordinary mid-flow correction is unaffected)", () => {
    // name/phone already known too, so nextRequiredField isn't "name" —
    // isolates this test to the bookingJustCompleted question alone,
    // avoiding the unrelated (pre-existing, out of scope here) bare-name
    // capture path that "next required field is name" would otherwise
    // engage for this message's leftover text.
    const midFlow: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    };
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "actually Wednesday instead", midFlow);
    // Falls through to the ordinary correction-marker path instead —
    // overwrites date only, exactly as before this feature existed.
    expect(extracted).toEqual({ date: "Wednesday" });
  });

  it("does NOT fire (and does not crash) when bookingJustCompleted is set but lastCompletedBooking is missing", () => {
    const extracted = extractStatedFields(
      BAHAMAS_DENTAL_SERVICE,
      "actually Wednesday instead",
      { bookingJustCompleted: true },
    );
    expect(extracted).toEqual({});
  });

  it("does NOT fire once a fresh intent is already established (bookingJustCompleted no longer meaningfully armed)", () => {
    const extracted = extractStatedFields(BAHAMAS_DENTAL_SERVICE, "actually Wednesday instead", {
      ...JUST_COMPLETED,
      intent: "book_appointment",
    });
    // Falls through to the ordinary mid-flow correction path.
    expect(extracted).toEqual({ date: "Wednesday" });
  });
});
