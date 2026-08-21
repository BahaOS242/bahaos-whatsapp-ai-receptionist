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
      request("Tuesday 6pm", afterService.bookingState),
    );
    expect(afterDateTime.bookingState.date).toBe("Tuesday");
    expect(afterDateTime.bookingState.time).toBe("18:00");
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
      time: "18:00",
      name: "Trevor",
    };
    const result = await provider.generateResponse(request("+1 242 801 2847", state));

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Tuesday",
          preferredTime: "18:00",
        },
      },
    ]);
    expect(result.bookingState).toEqual({});
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
