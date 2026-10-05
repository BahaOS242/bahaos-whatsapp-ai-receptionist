import OpenAI from "openai";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "./llm-chat-client";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "./tool-definitions";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** OpenRouter exposes an OpenAI-compatible `/chat/completions` endpoint,
 * so this reuses the `openai` package (already a dependency for
 * OpenAiChatClient) pointed at OpenRouter's base URL instead of writing
 * a separate HTTP client — structurally identical to OpenAiChatClient,
 * just with `baseURL` set and a routed (provider-prefixed) model id. */
export class OpenRouterChatClient implements LlmChatClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
    this.model = model;
  }

  async chat(params: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      tools: RECEPTIONIST_TOOL_DEFINITIONS,
    });

    const message = response.choices[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).filter(
      (
        call,
      ): call is Extract<NonNullable<typeof message.tool_calls>[number], { type: "function" }> =>
        call.type === "function",
    );

    // Some models (observed live with openai/gpt-4o-mini via OpenRouter)
    // return an empty (or whitespace-only) string as content on a turn
    // where they ALSO make a tool call, rather than pairing the tool call
    // with a sentence — normalized to null here (matching
    // AnthropicChatClient/GeminiChatClient's identical normalization) so
    // LLMProvider's `result.content ?? ""` fallback can't surface a blank
    // reply to the customer; "" is exactly as much "no text" as null is.
    const content = message?.content?.trim() ?? "";

    return {
      content: content.length > 0 ? content : null,
      toolCalls: toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        argumentsJson: call.function.arguments,
      })),
    };
  }
}
