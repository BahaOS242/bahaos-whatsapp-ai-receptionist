import { describe, expect, it, vi } from "vitest";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResponse,
  ReceptionistTools,
} from "../../src/ai/types";

function request(message = "hello"): AIProviderRequest {
  return { business: BAHAMAS_DENTAL_SERVICE, customer: {}, history: [], message, bookingState: {} };
}

class FakeAIProvider implements AIProvider {
  constructor(private readonly respond: () => AIProviderResponse | Promise<AIProviderResponse>) {}
  async generateResponse(): Promise<AIProviderResponse> {
    return this.respond();
  }
}

class ThrowingAIProvider implements AIProvider {
  constructor(private readonly error: unknown) {}
  async generateResponse(): Promise<AIProviderResponse> {
    throw this.error;
  }
}

/** All tools succeed by default; individual tests override specific ones. */
function makeTools(overrides: Partial<ReceptionistTools> = {}): ReceptionistTools {
  return {
    createLead: vi.fn(async () => ({ success: true })),
    requestAppointment: vi.fn(async () => ({ success: true })),
    requestReschedule: vi.fn(async () => ({ success: true })),
    requestCancellation: vi.fn(async () => ({ success: true })),
    escalate: vi.fn(async () => ({ success: true })),
    ...overrides,
  };
}

describe("ReceptionistAgent — lead capture", () => {
  it("executes create_lead via tools and forwards the provider's reply on success", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "Thanks Sarah, I've got your details.",
      actions: [{ type: "create_lead", payload: { name: "Sarah Combs", phone: "242-555-0199" } }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.createLead).toHaveBeenCalledWith({ name: "Sarah Combs", phone: "242-555-0199" });
    expect(result.reply).toBe("Thanks Sarah, I've got your details.");
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — appointment request", () => {
  it("executes request_appointment and reports success", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "2pm",
    };
    const provider = new FakeAIProvider(() => ({
      reply:
        "Perfect — I've captured your request for Routine cleaning on Tuesday at 2pm. A member of the team would confirm the appointment.",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.requestAppointment).toHaveBeenCalledWith(payload);
    expect(result.reply).toContain("captured your request");
    expect(result.reply).not.toMatch(/is booked|confirmed your appointment/i);
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — reschedule", () => {
  it("executes request_reschedule and reports success", async () => {
    const payload = {
      name: "John Miller",
      phone: "242-555-0111",
      newPreferredDate: "Thursday",
      newPreferredTime: "10am",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "Got it — I've noted your request to move your appointment to Thursday at 10am.",
      actions: [{ type: "request_reschedule", payload }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.requestReschedule).toHaveBeenCalledWith(payload);
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — cancellation", () => {
  it("executes request_cancellation and reports success", async () => {
    const payload = { name: "John Miller", phone: "242-555-0111" };
    const provider = new FakeAIProvider(() => ({
      reply: "Understood — I've flagged your appointment for cancellation.",
      actions: [{ type: "request_cancellation", payload }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.requestCancellation).toHaveBeenCalledWith(payload);
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — escalation", () => {
  it("executes escalate and forwards the handoff reply", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "I'd be happy to have someone from the clinic team help with that.",
      actions: [{ type: "escalate", payload: { reason: "customer asked for a human" } }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.escalate).toHaveBeenCalledWith({ reason: "customer asked for a human" });
    expect(result.reply).toContain("clinic team");
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — safety: failed booking", () => {
  it("never forwards the provider's success-sounding reply when the tool reports failure, and auto-escalates", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "2pm",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "Perfect — I've captured your request for Routine cleaning on Tuesday at 2pm.",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({
        success: false,
        error: "booking system unavailable",
      })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).not.toContain("Perfect — I've captured your request");
    expect(result.reply.toLowerCase()).not.toMatch(/captured|confirmed|booked/);
    expect(result.safetyOverride).toBe(true);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
    expect(result.actionsTaken.some((a) => a.action.type === "escalate" && a.result.success)).toBe(
      true,
    );
  });
});

describe("ReceptionistAgent — safety: malformed provider response", () => {
  it("falls back to an honest reply and escalates when the provider throws a malformed-response error", async () => {
    const provider = new ThrowingAIProvider(new Error("LLM tool call had invalid arguments"));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(result.reply.toLowerCase()).not.toMatch(/booked|confirmed|cancelled/);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
  });
});

describe("ReceptionistAgent — safety: LLM provider failure", () => {
  it("falls back to an honest reply and escalates when the provider call rejects", async () => {
    const provider = new ThrowingAIProvider(new Error("network timeout"));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(result.reply).toMatch(/wasn't able to complete/i);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
  });

  it("still returns a safe reply even if the escalate tool itself fails", async () => {
    const provider = new ThrowingAIProvider(new Error("network timeout"));
    const tools = makeTools({
      escalate: vi.fn(async () => ({ success: false, error: "escalation channel down" })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).toMatch(/wasn't able to complete/i);
    expect(result.safetyOverride).toBe(true);
  });
});

describe("ReceptionistAgent — safety: tool failure (throws, not just returns failure)", () => {
  it("catches a tool that throws instead of crashing the turn, and never claims success", async () => {
    const payload = { name: "John Miller", phone: "242-555-0111" };
    const provider = new FakeAIProvider(() => ({
      reply: "Understood — I've flagged your appointment for cancellation.",
      actions: [{ type: "request_cancellation", payload }],
      bookingState: {},
    }));
    const tools = makeTools({
      requestCancellation: vi.fn(async () => {
        throw new Error("database connection lost");
      }),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(result.reply).not.toContain("flagged your appointment for cancellation");
    expect(result.actionsTaken[0].result.success).toBe(false);
    expect(result.actionsTaken[0].result.error).toContain("database connection lost");
  });
});
