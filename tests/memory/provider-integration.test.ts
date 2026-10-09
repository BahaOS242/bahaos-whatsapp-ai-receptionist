import { describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProviderRequest } from "../../src/ai/types";
import { renderMemoryBlock } from "../../src/memory/retrieval";
import { createMemoryService } from "../../src/memory/create-memory-service";
import { loadEnv as parseEnv } from "../../src/config/env";
import type { StoredMemory } from "../../src/memory/types";

class Fake implements LlmChatClient {
  last: Parameters<LlmChatClient["chat"]>[0] | undefined;
  constructor(private readonly r: LlmChatResult) {}
  async chat(p: Parameters<LlmChatClient["chat"]>[0]) { this.last = p; return this.r; }
}
const req = (over: Partial<AIProviderRequest> = {}): AIProviderRequest => ({
  business: BAHAMAS_DENTAL_SERVICE, customer: {}, history: [], message: "Can I book a cleaning next week?", bookingState: {}, ...over,
});
const mem = (kind: StoredMemory["kind"], slot: string, value: string): StoredMemory => ({
  id: "00000000-0000-4000-8000-000000000001", kind, slot, value, display: value, status: "active", source: "customer_stated",
  createdAt: new Date(0), updatedAt: new Date(0), expiresAt: null,
});

describe("memory in the LLM prompt", () => {
  it("absent memory leaves the system prompt byte-identical to before", async () => {
    const a = new Fake({ content: "ok", toolCalls: [] });
    const b = new Fake({ content: "ok", toolCalls: [] });
    await new LLMProvider(a).generateResponse(req());
    await new LLMProvider(b).generateResponse(req({ memory: undefined }));
    expect(a.last!.systemPrompt).toBe(b.last!.systemPrompt);
    expect(a.last!.systemPrompt).not.toContain("CUSTOMER MEMORY");
  });

  it("present memory is appended AFTER all existing rules, as delimited data, and the base prompt is untouched", async () => {
    const base = new Fake({ content: "ok", toolCalls: [] });
    const withMem = new Fake({ content: "ok", toolCalls: [] });
    const block = renderMemoryBlock([mem("scheduling_preference", "time_of_day", "morning")])!;
    await new LLMProvider(base).generateResponse(req());
    await new LLMProvider(withMem).generateResponse(req({ memory: block }));
    expect(withMem.last!.systemPrompt.startsWith(base.last!.systemPrompt)).toBe(true);
    expect(withMem.last!.systemPrompt.slice(base.last!.systemPrompt.length)).toContain("prefer morning appointments");
  });

  it("memory does not change which tools the model may call or the booking state the provider returns", async () => {
    const mk = () => new Fake({ content: "Sure.", toolCalls: [] });
    const a = await new LLMProvider(mk()).generateResponse(req());
    const b = await new LLMProvider(mk()).generateResponse(req({ memory: renderMemoryBlock([mem("preferred_name", "name", "Alicia")]) }));
    expect(b.actions).toEqual(a.actions);
    expect(b.bookingState).toEqual(a.bookingState);
  });
});

describe("feature flag", () => {
  const base = { DATABASE_URL: "postgres://localhost/x", NODE_ENV: "test" } as Record<string, string>;
  it("defaults to OFF: no service is created", () => {
    expect(createMemoryService(BAHAMAS_DENTAL_SERVICE, parseEnv(base))).toBeUndefined();
  });
  it("a non-boolean value is rejected rather than silently enabling memory", () => {
    expect(() => parseEnv({ ...base, MEMORY_ENABLED: "yes" })).toThrow(/MEMORY_ENABLED/);
  });
  it("explicit true creates the service; false does not", () => {
    expect(createMemoryService(BAHAMAS_DENTAL_SERVICE, parseEnv({ ...base, MEMORY_ENABLED: "true" }))).toBeDefined();
    expect(createMemoryService(BAHAMAS_DENTAL_SERVICE, parseEnv({ ...base, MEMORY_ENABLED: "false" }))).toBeUndefined();
  });
});
