import { describe, expect, it } from "vitest";
import { LLMProvider, MalformedLlmResponseError } from "../../src/ai/providers/llm-provider";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProviderRequest } from "../../src/ai/types";

/** Test double — no network, no API key, fully deterministic. */
class FakeLlmChatClient implements LlmChatClient {
  public lastCallArgs: Parameters<LlmChatClient["chat"]>[0] | undefined;

  constructor(private readonly result: LlmChatResult | (() => LlmChatResult)) {}

  async chat(params: Parameters<LlmChatClient["chat"]>[0]): Promise<LlmChatResult> {
    this.lastCallArgs = params;
    return typeof this.result === "function" ? this.result() : this.result;
  }
}

function request(message: string, overrides: Partial<AIProviderRequest> = {}): AIProviderRequest {
  return {
    business: BAHAMAS_DENTAL_SERVICE,
    customer: {},
    history: [],
    message,
    bookingState: {},
    ...overrides,
  };
}

describe("LLMProvider — prompt construction (mocked client)", () => {
  it("includes business info, services, and policies in the system prompt", async () => {
    const client = new FakeLlmChatClient({ content: "We're open weekdays.", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(request("What are your hours?"));

    expect(client.lastCallArgs?.systemPrompt).toContain(BAHAMAS_DENTAL_SERVICE.name);
    expect(client.lastCallArgs?.systemPrompt).toContain(BAHAMAS_DENTAL_SERVICE.hours);
    for (const service of BAHAMAS_DENTAL_SERVICE.services) {
      expect(client.lastCallArgs?.systemPrompt).toContain(service.name);
    }
    expect(client.lastCallArgs?.systemPrompt).toContain(BAHAMAS_DENTAL_SERVICE.policies.insurance);
  });

  it("forwards conversation history and the current customer context", async () => {
    const client = new FakeLlmChatClient({ content: "Sure thing.", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(
      request("Tuesday at 2pm", {
        customer: { name: "Sarah Combs", phone: "242-555-0199" },
        history: [
          { role: "assistant", content: "How can I help?" },
          { role: "customer", content: "I'd like to book a cleaning" },
        ],
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("Sarah Combs");
    expect(client.lastCallArgs?.systemPrompt).toContain("242-555-0199");
    expect(client.lastCallArgs?.messages).toEqual([
      { role: "assistant", content: "How can I help?" },
      { role: "user", content: "I'd like to book a cleaning" },
      { role: "user", content: "Tuesday at 2pm" },
    ]);
  });
});

describe("LLMProvider — tool call parsing", () => {
  it("turns a valid request_appointment tool call into a ReceptionistAction", async () => {
    const client = new FakeLlmChatClient({
      content: "Got it, requesting that now.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Sarah Combs",
            phone: "242-555-0199",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "2pm",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("Tuesday at 2pm please"));

    expect(result.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Sarah Combs",
          phone: "242-555-0199",
          service: "Routine cleaning",
          preferredDate: "Tuesday",
          preferredTime: "2pm",
        },
      },
    ]);
  });

  it("parses an escalate tool call", async () => {
    const client = new FakeLlmChatClient({
      content: "I'll get someone from the team to help.",
      toolCalls: [
        {
          id: "call_1",
          name: "escalate",
          argumentsJson: JSON.stringify({ reason: "customer asked for a human" }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(request("Can I speak to a person?"));
    expect(result.actions).toEqual([
      { type: "escalate", payload: { reason: "customer asked for a human" } },
    ]);
  });
});

describe("LLMProvider — malformed responses", () => {
  it("throws when the model returns neither text nor tool calls", async () => {
    const client = new FakeLlmChatClient({ content: null, toolCalls: [] });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("hello"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });

  it("throws when a tool call's arguments are not valid JSON", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [{ id: "call_1", name: "request_appointment", argumentsJson: "{not json" }],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("book me in"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });

  it("throws when a tool call is missing required fields", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      // request_appointment requires phone/service/date/time too — only name given.
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({ name: "Sarah" }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("book me in"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });

  it("throws when the model calls an unknown tool name", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [{ id: "call_1", name: "delete_all_appointments", argumentsJson: "{}" }],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("hello"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });
});

describe("LLMProvider — structured booking state (not prose re-parsing)", () => {
  it("includes the current booking state in the system prompt as known fact", async () => {
    const client = new FakeLlmChatClient({ content: "Great, what time works?", toolCalls: [] });
    const provider = new LLMProvider(client);

    await provider.generateResponse(
      request("Tuesday", {
        bookingState: { intent: "book_appointment", service: "Basic filling", name: "Trevor" },
      }),
    );

    expect(client.lastCallArgs?.systemPrompt).toContain("service: Basic filling");
    expect(client.lastCallArgs?.systemPrompt).toContain("name: Trevor");
  });

  it("merges an update_booking_progress call into the persisted state", async () => {
    const client = new FakeLlmChatClient({
      content: "Got it — what time works?",
      toolCalls: [
        {
          id: "call_1",
          name: "update_booking_progress",
          argumentsJson: JSON.stringify({
            intent: "book_appointment",
            service: "Basic filling",
            date: "Tuesday",
            name: "Trevor",
            phone: "+12428012847",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("Trevor, +1 242 801 2847", {
        bookingState: { intent: "book_appointment", service: "Basic filling", date: "Tuesday" },
      }),
    );

    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Basic filling",
      date: "Tuesday",
      name: "Trevor",
      phone: "+12428012847",
    });
    // update_booking_progress is bookkeeping, not a customer-facing action.
    expect(result.actions).toEqual([]);
  });

  it("clears booking state once a completing action (request_appointment) fires", async () => {
    const client = new FakeLlmChatClient({
      content: "Perfect — I've captured your request.",
      toolCalls: [
        {
          id: "call_1",
          name: "request_appointment",
          argumentsJson: JSON.stringify({
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "18:00",
          }),
        },
      ],
    });
    const provider = new LLMProvider(client);

    const result = await provider.generateResponse(
      request("that's everything", {
        bookingState: {
          intent: "book_appointment",
          service: "Basic filling",
          date: "Tuesday",
          time: "18:00",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    );

    expect(result.bookingState).toEqual({});
  });

  it("throws on a malformed update_booking_progress call rather than silently dropping it", async () => {
    const client = new FakeLlmChatClient({
      content: null,
      toolCalls: [{ id: "call_1", name: "update_booking_progress", argumentsJson: "{not json" }],
    });
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("Tuesday"))).rejects.toThrow(
      MalformedLlmResponseError,
    );
  });
});

describe("LLMProvider — provider failure", () => {
  it("propagates a rejected chat call rather than swallowing it", async () => {
    const client: LlmChatClient = {
      chat: async () => {
        throw new Error("network error");
      },
    };
    const provider = new LLMProvider(client);

    await expect(provider.generateResponse(request("hello"))).rejects.toThrow("network error");
  });
});
