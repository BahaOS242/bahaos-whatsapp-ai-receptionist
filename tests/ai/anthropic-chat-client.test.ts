import { describe, expect, it, vi } from "vitest";

/**
 * Genuine production-readiness gap found in the webhook-latency audit:
 * the Anthropic SDK's own defaults (10-minute timeout, up to 2 automatic
 * retries of a timed-out request) mean a hung/degraded Anthropic API
 * could hold the webhook's per-customer advisory-locked transaction (and
 * its pooled DB connection) open for up to ~30 minutes — see
 * anthropic-chat-client.ts's own docstring. This proves the constructor
 * actually configures a bounded timeout/retry count on the underlying
 * SDK client, not just that it compiles.
 */
const constructorArgs: unknown[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class FakeAnthropic {
      messages = { create: vi.fn() };
      constructor(...args: unknown[]) {
        constructorArgs.push(...args);
      }
    },
  };
});

describe("AnthropicChatClient — bounded timeout/retries (never the SDK's 10-minute default)", () => {
  it("configures a bounded timeout and retry count by default", async () => {
    const { AnthropicChatClient } = await import("../../src/ai/providers/anthropic-chat-client.js");
    constructorArgs.length = 0;

    new AnthropicChatClient("test-key", "claude-test");

    expect(constructorArgs).toHaveLength(1);
    const options = constructorArgs[0] as { apiKey: string; timeout: number; maxRetries: number };
    expect(options.apiKey).toBe("test-key");
    expect(options.timeout).toBeLessThanOrEqual(30_000);
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.maxRetries).toBeLessThanOrEqual(1);
  });

  it("accepts explicit overrides", async () => {
    const { AnthropicChatClient } = await import("../../src/ai/providers/anthropic-chat-client.js");
    constructorArgs.length = 0;

    new AnthropicChatClient("test-key", "claude-test", 5_000, 0);

    const options = constructorArgs[0] as { timeout: number; maxRetries: number };
    expect(options.timeout).toBe(5_000);
    expect(options.maxRetries).toBe(0);
  });
});
