import { describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { AIProviderRequest } from "../../src/ai/types";
import { detectMemoryControl, validateCandidate } from "../../src/memory/policy";
import { renderControlNotice, renderMemoryBlock } from "../../src/memory/retrieval";
import { MAX_MEMORY_BLOCK_CHARS, MAX_MEMORY_PROMPT_CHARS, type StoredMemory } from "../../src/memory/types";

class Fake implements LlmChatClient {
  last: Parameters<LlmChatClient["chat"]>[0] | undefined;
  async chat(p: Parameters<LlmChatClient["chat"]>[0]): Promise<LlmChatResult> { this.last = p; return { content: "ok", toolCalls: [] }; }
}
const req = (memory?: string): AIProviderRequest => ({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history: [], message: "hello", bookingState: {}, memory });
const mem = (i: number, kind: StoredMemory["kind"], slot: string, value: string, display = value): StoredMemory => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, kind, slot, value, display, status: "active", source: "customer_stated",
  createdAt: new Date(0), updatedAt: new Date(0), expiresAt: null,
});

describe("memory-control detection is narrow", () => {
  it.each([
    ["Remove my appointment for Tuesday", null],
    ["Please cancel my appointment", null],
    ["Delete the booking", null],
    ["Can you reschedule me? I no longer need Tuesday", null],
    ["I no longer prefer mornings", ["scheduling_preference"]],
    ["Forget that I prefer mornings", ["scheduling_preference"]],
    ["Don't remember my name", ["preferred_name"]],
    ["Stop remembering things about me", "all"],
    ["Please forget what you know about me", "all"],
    ["Forget my language preference", ["preferred_language", "scheduling_preference"]],
    ["Don't remember that", "all"],
  ])("%s", (m, expected) => {
    const c = detectMemoryControl(m);
    if (expected === null) expect(c).toBeNull();
    else if (expected === "all") expect(c?.scope).toBe("all");
    else expect(c?.scope === "all" ? "all" : [...(c?.scope ?? [])].sort()).toEqual([...expected].sort());
  });
});

describe("prompt-assembly boundary", () => {
  it("the worst-case rendered block fits the provider's hard ceiling, and the data part respects the 600-char bound", () => {
    const many = Array.from({ length: 12 }, (_, i) => mem(i + 1, "service_interest", `service:s${i}`, `s${i}`, "x".repeat(80)));
    const block = renderMemoryBlock(many.slice(0, 5))!;
    expect(block.length).toBeLessThan(MAX_MEMORY_PROMPT_CHARS);
    expect(block.split("\n").find((l) => l.startsWith("DATA "))!.length - 5).toBeLessThanOrEqual(MAX_MEMORY_BLOCK_CHARS);
    expect(renderControlNotice().length).toBeLessThan(MAX_MEMORY_PROMPT_CHARS);
  });

  it("the provider refuses an oversized memory string even if some other caller assembled one", async () => {
    const base = new Fake();
    const huge = new Fake();
    const p = new LLMProvider(base);
    await p.generateResponse(req());
    await new LLMProvider(huge).generateResponse(req("=== CUSTOMER MEMORY ===\n" + "A".repeat(MAX_MEMORY_PROMPT_CHARS + 1)));
    expect(huge.last!.systemPrompt).toBe(base.last!.systemPrompt);
  });

  it("a within-bounds string is appended after the base prompt", async () => {
    const base = new Fake();
    const withMem = new Fake();
    await new LLMProvider(base).generateResponse(req());
    await new LLMProvider(withMem).generateResponse(req(renderMemoryBlock([mem(1, "preferred_name", "name", "Alicia")])));
    expect(withMem.last!.systemPrompt.startsWith(base.last!.systemPrompt)).toBe(true);
    expect(withMem.last!.systemPrompt).toContain("Alicia");
  });

  it("the control notice never repeats remembered values and denies erasing records", () => {
    const n = renderControlNotice();
    expect(n).toContain("Do not claim that everything was deleted");
    expect(n).toContain("Never repeat the details back");
  });
});

describe("validation gate refuses clinical-procedure interests regardless of who proposed them", () => {
  it.each(["root_canal", "filling", "extraction", "crown", "wisdom_teeth", "emergency"])("service_interest %s", (id) => {
    expect(validateCandidate({ kind: "service_interest", slot: `service:${id}`, value: id, display: id.replace("_", " "), source: "customer_stated", provenance: "explicit" }))
      .toEqual({ ok: false, reason: "sensitive" });
  });
  it("continuity inquiry for a clinical procedure", () => {
    expect(validateCandidate({ kind: "continuity", slot: "inquiry:root_canal", value: "root_canal", display: "Root canal", source: "system_derived", provenance: "explicit", ttlSeconds: 60 }))
      .toEqual({ ok: false, reason: "sensitive" });
  });
  it("non-clinical services pass", () => {
    for (const id of ["cleaning", "consultation", "whitening"]) {
      expect(validateCandidate({ kind: "service_interest", slot: `service:${id}`, value: id, source: "customer_stated", provenance: "explicit" }).ok).toBe(true);
    }
  });
});
