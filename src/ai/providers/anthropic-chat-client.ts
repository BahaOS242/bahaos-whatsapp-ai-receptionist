import Anthropic from "@anthropic-ai/sdk";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "./llm-chat-client";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "./tool-definitions";

const MAX_TOKENS = 1024;

/** Derived from the same RECEPTIONIST_TOOL_DEFINITIONS OpenAiChatClient
 * uses — one source of truth for the 6 tool schemas, just reshaped from
 * OpenAI's {type:"function", function:{name, parameters}} into
 * Anthropic's {name, input_schema} shape. */
const ANTHROPIC_TOOLS: Anthropic.Tool[] = RECEPTIONIST_TOOL_DEFINITIONS.filter(
  (tool): tool is Extract<typeof tool, { type: "function" }> => tool.type === "function",
).map((tool) => ({
  name: tool.function.name,
  description: tool.function.description,
  input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
}));

/** The only file in this codebase that imports the `@anthropic-ai/sdk`
 * package — mirrors OpenAiChatClient's shape exactly, adapted to
 * Anthropic's Messages API: the system prompt is a top-level `system`
 * param (not a "system"-role message), a reply's content is a block
 * array (text/tool_use blocks, not a single string + separate tool_calls
 * array), and tool schemas use `input_schema` instead of `parameters`. */
/** Genuine production-readiness gap found auditing the WhatsApp webhook's
 * synchronous processing path: this client's own `messages.create` call
 * runs INSIDE processInboundWhatsAppMessage's per-customer advisory-
 * locked database transaction (see webhook-processing.ts) — but the
 * Anthropic SDK's OWN defaults are a 10-MINUTE timeout and up to 2
 * automatic retries of a timed-out request, meaning a genuinely hung or
 * badly-degraded Anthropic API could hold that transaction (and its
 * advisory lock, and its pooled database connection) open for up to
 * ~30 minutes. Every Meta webhook retry for the SAME customer arriving
 * in that window would itself block on the same lock, accumulating
 * blocked connections rather than failing fast — a real resource-
 * exhaustion risk under a realistic failure mode (an LLM provider
 * outage/slowdown), not a hypothetical-scale concern. `timeoutMs`/
 * `maxRetries` default to values that keep total worst-case latency
 * comfortably bounded (well under a webhook delivery's own timeout
 * budget) while still tolerating one transient hiccup; a slow/hung
 * request now fails FAST and correctly routes through
 * ReceptionistAgent's existing "AIProvider failed" safe-fallback/
 * escalation path (see receptionist-agent.ts) instead of hanging. */
export class AnthropicChatClient implements LlmChatClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string, timeoutMs = 20_000, maxRetries = 1) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries });
    this.model = model;
  }

  async chat(params: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: params.systemPrompt,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: ANTHROPIC_TOOLS,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const toolCalls = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        name: block.name,
        argumentsJson: JSON.stringify(block.input),
      }));

    return { content: text.length > 0 ? text : null, toolCalls };
  }
}
