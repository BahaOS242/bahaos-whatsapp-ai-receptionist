import { describe, expect, it } from "vitest";
import {
  computePendingAction,
  describeNextField,
  nextRequiredField,
} from "../../src/ai/booking-progression";
import type { BookingState } from "../../src/ai/types";

describe("nextRequiredField — application-owned booking progression", () => {
  it("no active intent: nothing required", () => {
    expect(nextRequiredField({})).toBeUndefined();
  });

  it("book_appointment: service known, date/time missing -> next is date (combined with time in describeNextField)", () => {
    const state: BookingState = { intent: "book_appointment", service: "Routine cleaning" };
    expect(nextRequiredField(state)).toBe("date");
  });

  it("book_appointment: date known but time missing -> next is time alone", () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
    };
    expect(nextRequiredField(state)).toBe("time");
  });

  it("book_appointment: date and time known -> next is name", () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
    };
    expect(nextRequiredField(state)).toBe("name");
  });

  it("book_appointment: name known, phone missing -> next is phone", () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
    };
    expect(nextRequiredField(state)).toBe("phone");
  });

  it("book_appointment: everything known -> nothing left to require", () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    };
    expect(nextRequiredField(state)).toBeUndefined();
  });

  it("reschedule_appointment has its own field order (no service)", () => {
    expect(nextRequiredField({ intent: "reschedule_appointment" })).toBe("date");
    expect(nextRequiredField({ intent: "reschedule_appointment", date: "Tuesday" })).toBe("time");
    expect(
      nextRequiredField({ intent: "reschedule_appointment", date: "Tuesday", time: "14:00" }),
    ).toBe("name");
  });

  it("cancel_appointment only requires name/phone", () => {
    expect(nextRequiredField({ intent: "cancel_appointment" })).toBe("name");
    expect(nextRequiredField({ intent: "cancel_appointment", name: "Trevor" })).toBe("phone");
  });
});

describe("describeNextField — compact natural-language label", () => {
  it("no booking in progress", () => {
    expect(describeNextField({})).toBe("none — no booking in progress");
  });

  it("both date and time missing -> combined label", () => {
    expect(describeNextField({ intent: "book_appointment", service: "Routine cleaning" })).toBe(
      "date and time",
    );
  });

  it("only time missing -> single field label, not combined", () => {
    expect(
      describeNextField({
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
      }),
    ).toBe("time");
  });

  it("name is next", () => {
    expect(
      describeNextField({
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
      }),
    ).toBe("name");
  });

  it("phone is next", () => {
    expect(
      describeNextField({
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
      }),
    ).toBe("phone");
  });

  it("everything known -> ready-to-finalize label, not a field name", () => {
    expect(
      describeNextField({
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
      }),
    ).toBe("none — every required field is known");
  });
});

describe("computePendingAction — deterministic replacement for model-reported pendingAction", () => {
  it("no intent at all -> undefined", () => {
    expect(computePendingAction({})).toBeUndefined();
  });

  it("intent set but something still missing -> undefined", () => {
    expect(
      computePendingAction({ intent: "book_appointment", service: "Routine cleaning" }),
    ).toBeUndefined();
  });

  it("every required field known for book_appointment -> confirm_service", () => {
    expect(
      computePendingAction({
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
      }),
    ).toBe("confirm_service");
  });

  it("every required field known for reschedule_appointment (no service needed) -> confirm_service", () => {
    expect(
      computePendingAction({
        intent: "reschedule_appointment",
        date: "Wednesday",
        time: "10:00",
        name: "Trevor",
        phone: "+12428012847",
      }),
    ).toBe("confirm_service");
  });

  it("every required field known for cancel_appointment (just name/phone) -> confirm_service", () => {
    expect(
      computePendingAction({ intent: "cancel_appointment", name: "Trevor", phone: "+12428012847" }),
    ).toBe("confirm_service");
  });
});
