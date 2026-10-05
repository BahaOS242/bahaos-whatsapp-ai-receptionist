import { describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { AIProviderRequest, BookingState, ConversationTurn } from "../../src/ai/types";

function request(
  message: string,
  bookingState: BookingState = {},
  history: ConversationTurn[] = [],
): AIProviderRequest {
  return { business: BAHAMAS_DENTAL_SERVICE, customer: {}, history, message, bookingState };
}

describe("DevRuleBasedAIProvider — FAQ", () => {
  const provider = new DevRuleBasedAIProvider();

  it("answers an hours question from business context", async () => {
    const result = await provider.generateResponse(request("What are your hours?"));
    expect(result.reply).toContain(BAHAMAS_DENTAL_SERVICE.hours);
    expect(result.actions).toEqual([]);
  });

  it("answers a location question", async () => {
    const result = await provider.generateResponse(request("Where are you located?"));
    expect(result.reply).toContain(BAHAMAS_DENTAL_SERVICE.address);
  });

  it("answers an insurance question", async () => {
    const result = await provider.generateResponse(request("Do you take insurance?"));
    expect(result.reply).toBe(BAHAMAS_DENTAL_SERVICE.policies.insurance);
  });
});

describe("DevRuleBasedAIProvider — business knowledge", () => {
  const provider = new DevRuleBasedAIProvider();

  it("lists services from business context, not invented ones", async () => {
    const result = await provider.generateResponse(request("What services do you offer?"));
    for (const service of BAHAMAS_DENTAL_SERVICE.services) {
      expect(result.reply).toContain(service.name);
    }
  });

  it("answers a specific service mention with its real price and duration", async () => {
    const result = await provider.generateResponse(request("How much is a root canal?"));
    expect(result.reply).toContain("Root canal");
    expect(result.reply).toContain("B$950");
    expect(result.reply).toContain("90 minutes");
  });
});

describe("DevRuleBasedAIProvider — structured booking state (multi-turn)", () => {
  const provider = new DevRuleBasedAIProvider();

  it("starts a booking flow and asks for the first missing field", async () => {
    const result = await provider.generateResponse(request("I'd like to book an appointment"));
    expect(result.bookingState.intent).toBe("book_appointment");
    expect(result.reply).toMatch(/which service/i);
  });

  it("persists a field across turns without needing to re-derive it from history", async () => {
    const afterService = await provider.generateResponse(
      request("filling", { intent: "book_appointment" }),
    );
    expect(afterService.bookingState.service).toBe("Basic filling");
    expect(afterService.reply).toMatch(/day and time/i);

    const afterDateTime = await provider.generateResponse(
      request("Tuesday 2pm", afterService.bookingState),
    );
    expect(afterDateTime.bookingState.date).toBe("Tuesday");
    expect(afterDateTime.bookingState.time).toBe("14:00");
    // Should not re-ask for service — it's already in bookingState.
    expect(afterDateTime.reply).not.toMatch(/which service/i);
  });

  it("does not throw away a resolved date when the time is ambiguous, and asks only for time", async () => {
    const state: BookingState = { intent: "book_appointment", service: "Basic filling" };
    const result = await provider.generateResponse(request("tomorrow and 6", state));

    expect(result.bookingState.date).toBeDefined();
    expect(result.bookingState.time).toBeUndefined();
    expect(result.reply).toMatch(/time/i);
    expect(result.reply).not.toMatch(/day and time/i);
  });

  it("clears booking state once the flow completes", async () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Basic filling",
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
    };
    const confirming = await provider.generateResponse(request("+1 242 801 2847", state));

    // Objective 2's hard gate: every field being known now presents a
    // confirm-and-summarize prompt instead of booking immediately.
    expect(confirming.actions).toEqual([]);
    expect(confirming.bookingState.pendingAction).toBe("confirm_booking");
    expect(confirming.reply).toMatch(/reply yes to confirm/i);

    const result = await provider.generateResponse(request("yes", confirming.bookingState));

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);
    expect(result.bookingState).toEqual({});
  });
});

describe("DevRuleBasedAIProvider — pending confirmation regression (structured yes/no)", () => {
  const provider = new DevRuleBasedAIProvider();

  it("1. 'I want a cleaning' -> 'yes' proceeds to the next booking field, not a fallback", async () => {
    const offer = await provider.generateResponse(request("I want a cleaning"));
    expect(offer.bookingState.pendingAction).toBe("confirm_service");
    expect(offer.reply).toMatch(/would you like to book it/i);

    const confirmed = await provider.generateResponse(request("yes", offer.bookingState));
    expect(confirmed.reply).not.toMatch(/not totally sure I caught that/i);
    expect(confirmed.reply).toMatch(/what day and time/i);
    expect(confirmed.bookingState.intent).toBe("book_appointment");
    expect(confirmed.bookingState.service).toBe("Routine cleaning");
    expect(confirmed.bookingState.pendingAction).toBeUndefined();
  });

  it("2. 'I want a cleaning' -> 'yes please' behaves the same", async () => {
    const offer = await provider.generateResponse(request("I want a cleaning"));
    const confirmed = await provider.generateResponse(request("yes please", offer.bookingState));

    expect(confirmed.reply).toMatch(/what day and time/i);
    expect(confirmed.bookingState.service).toBe("Routine cleaning");
  });

  it("3. 'I want a cleaning' -> 'yeah' behaves the same", async () => {
    const offer = await provider.generateResponse(request("I want a cleaning"));
    const confirmed = await provider.generateResponse(request("yeah", offer.bookingState));

    expect(confirmed.reply).toMatch(/what day and time/i);
    expect(confirmed.bookingState.service).toBe("Routine cleaning");
  });

  it("4. 'I want a cleaning' -> 'no' declines without starting a booking", async () => {
    const offer = await provider.generateResponse(request("I want a cleaning"));
    const declined = await provider.generateResponse(request("no", offer.bookingState));

    expect(declined.reply).toMatch(/no problem/i);
    expect(declined.actions).toEqual([]);
    expect(declined.bookingState).toEqual({});
  });

  it("5. bare 'cleaning' -> confirmation -> 'yes' also works", async () => {
    const offer = await provider.generateResponse(request("cleaning"));
    expect(offer.bookingState.service).toBe("Routine cleaning");

    const confirmed = await provider.generateResponse(request("yes", offer.bookingState));
    expect(confirmed.reply).toMatch(/what day and time/i);
  });

  it("6. 'root canal' -> confirmation -> 'yes' also works", async () => {
    const offer = await provider.generateResponse(request("root canal"));
    expect(offer.bookingState.service).toBe("Root canal");

    const confirmed = await provider.generateResponse(request("yes", offer.bookingState));
    expect(confirmed.reply).toMatch(/what day and time/i);
  });

  it("7. confirmation followed by date/time moves straight to name/phone", async () => {
    const offer = await provider.generateResponse(request("I want a cleaning"));
    const confirmed = await provider.generateResponse(request("yes", offer.bookingState));
    const dateTime = await provider.generateResponse(
      request("Tuesday at 2pm", confirmed.bookingState),
    );

    expect(dateTime.bookingState.date).toBe("Tuesday");
    expect(dateTime.bookingState.time).toBe("14:00");
    expect(dateTime.reply).toMatch(/name and phone/i);
  });

  it("8. confirmation followed by name/phone moves straight to date/time", async () => {
    const offer = await provider.generateResponse(request("I want a cleaning"));
    const confirmed = await provider.generateResponse(request("yes", offer.bookingState));
    const identity = await provider.generateResponse(
      request("My name is Trevor, phone 242-801-2847", confirmed.bookingState),
    );

    expect(identity.bookingState.name).toBe("Trevor");
    expect(identity.bookingState.phone).toBe("+12428012847");
    expect(identity.reply).toMatch(/what day and time/i);
  });

  it("9. a declined confirmation never produces a request_appointment action", async () => {
    const offer = await provider.generateResponse(request("root canal"));
    const declined = await provider.generateResponse(request("no thanks", offer.bookingState));

    expect(declined.actions.some((a) => a.type === "request_appointment")).toBe(false);
    expect(declined.bookingState.intent).toBeUndefined();
  });

  it("does not start a booking just because a name-shaped statement is said out of context", async () => {
    // Scenario 5 from the bug report: "my name is Trevor" with no active
    // flow and nothing pending must not be read as booking data.
    const result = await provider.generateResponse(request("my name is Trevor"));

    expect(result.bookingState.intent).toBeUndefined();
    expect(result.actions).toEqual([]);
  });

  it("still captures a name mid-flow when it's genuinely the missing field", async () => {
    const state: BookingState = {
      intent: "book_appointment",
      service: "Basic filling",
      date: "Tuesday",
      time: "14:00",
    };
    const result = await provider.generateResponse(request("my name is Trevor", state));

    expect(result.bookingState.name).toBe("Trevor");
  });
});

describe("DevRuleBasedAIProvider — escalation", () => {
  const provider = new DevRuleBasedAIProvider();

  it("escalates on an explicit request for a human", async () => {
    const result = await provider.generateResponse(request("Can I talk to a real person please"));
    expect(result.actions).toEqual([
      { type: "escalate", payload: { reason: "customer explicitly asked for a person" } },
    ]);
  });

  it("escalates on a described emergency instead of booking automatically", async () => {
    const result = await provider.generateResponse(
      request("My tooth really hurts, I think it's broken"),
    );
    expect(result.actions.some((a) => a.type === "escalate")).toBe(true);
    expect(result.reply).toBe(BAHAMAS_DENTAL_SERVICE.policies.emergencyPolicy);
  });
});

describe("DevRuleBasedAIProvider — REGRESSION (Objective 4): genuinely-unclear turns escalate after repeated confusion", () => {
  const provider = new DevRuleBasedAIProvider();

  it("a single unrecognized message still gets one honest 'I didn't catch that' — no escalation yet", async () => {
    const result = await provider.generateResponse(request("asdkjfh??"));

    expect(result.reply).toMatch(/not totally sure i caught that/i);
    expect(result.actions.some((a) => a.type === "escalate")).toBe(false);
    expect(result.bookingState.unclearTurnCount).toBe(1);
  });

  it("a SECOND consecutive unrecognized message escalates instead of repeating the same question again", async () => {
    const first = await provider.generateResponse(request("asdkjfh??"));
    const second = await provider.generateResponse(request("qwoeiru", first.bookingState));

    expect(second.reply).not.toMatch(/not totally sure i caught that/i);
    expect(second.reply).toMatch(/connect you with a member of our team/i);
    expect(second.actions).toEqual([
      {
        type: "escalate",
        payload: {
          reason: "customer's messages could not be understood after repeated attempts",
          unresolvedQuestion: "qwoeiru",
        },
      },
    ]);
    expect(second.bookingState.unclearTurnCount).toBeUndefined();
  });

  it("a legitimate FAQ answered in between resets the counter — no escalation on a later unrelated unclear turn", async () => {
    const first = await provider.generateResponse(request("asdkjfh??"));
    expect(first.bookingState.unclearTurnCount).toBe(1);

    // A real, understood FAQ question — must clear the counter, not
    // silently carry it forward.
    const faq = await provider.generateResponse(request("what are your hours?", first.bookingState));
    expect(faq.bookingState.unclearTurnCount).toBeUndefined();

    // Another unrelated unclear message — this is only the FIRST unclear
    // turn again (the counter was reset by the FAQ in between), so it
    // must NOT escalate.
    const third = await provider.generateResponse(request("asdkjfh??", faq.bookingState));
    expect(third.actions.some((a) => a.type === "escalate")).toBe(false);
    expect(third.bookingState.unclearTurnCount).toBe(1);
  });

  it("legitimate, repeated FAQ questions never count as 'unclear', even asked many times in a row", async () => {
    let bookingState: BookingState = {};
    for (let i = 0; i < 4; i++) {
      const result = await provider.generateResponse(request("what are your hours?", bookingState));
      expect(result.actions.some((a) => a.type === "escalate")).toBe(false);
      bookingState = result.bookingState;
    }
  });

  it("an emergency described right after an unclear turn is still recognized and clears the counter", async () => {
    const first = await provider.generateResponse(request("asdkjfh??"));
    const emergency = await provider.generateResponse(
      request("my tooth really hurts, I think it's broken", first.bookingState),
    );

    expect(emergency.actions.some((a) => a.type === "escalate")).toBe(true);
    expect(emergency.reply).toBe(BAHAMAS_DENTAL_SERVICE.policies.emergencyPolicy);
    expect(emergency.bookingState.unclearTurnCount).toBeUndefined();
  });
});
