import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "../../src/ai/providers/tool-definitions";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "../../src/ai/providers/llm-chat-client";

/**
 * Harness-only LlmChatClient implementations for the live LLM comparison.
 *
 * These deliberately do NOT import or extend the production
 * AnthropicChatClient/OpenRouterChatClient classes. Both production
 * classes discard the raw API response after shaping it into
 * LlmChatResult, but this harness needs the raw `response.model` on
 * every call — OpenRouter's `openrouter/free` alias routes each request
 * to whichever free model is currently available and capable, so
 * "which model actually answered" is a first-class result field the
 * comparison report requires, not an afterthought.
 *
 * Rather than modify the protected production files to add an
 * observability hook, each class below is a small, mechanical
 * side-by-side reimplementation of the same request/response shaping —
 * same SDK, same base URL, same tool definitions (imported from
 * production, not copied), same blank-content normalization — plus one
 * extra field. This keeps every file listed in the task's "do not
 * change" boundary (ConversationManager, ReceptionistAgent, LLMProvider,
 * booking-state extraction, booking progression, tools, escalation,
 * availability, safety rules — and, by the same spirit, the two
 * production chat-client files) completely untouched; the harness wraps
 * the system by supplying its own LlmChatClient, exactly the same
 * extension point ScriptedLlmChatClient already uses in the test suite.
 */

export interface ObservedCall {
  /** The `model` field OpenRouter/Anthropic actually reported for this
   * specific call — for OpenRouter, this can differ from the requested
   * `openrouter/free` alias. Absent when the call errored before a
   * response was received. */
  model?: string;
  latencyMs: number;
  /** Set when the underlying SDK call threw (network error, rate limit,
   * auth failure, ...) — always rethrown after being recorded here so
   * ReceptionistAgent's own error handling (safety-fallback + escalate)
   * still runs exactly as it does in production; this is purely an
   * observation tap; see run-scenario.ts for how it's used to tell an
   * infrastructure failure apart from the model just behaving badly. */
  error?: string;
}

const ANTHROPIC_MAX_TOKENS = 1024;

const ANTHROPIC_TOOLS: Anthropic.Tool[] = RECEPTIONIST_TOOL_DEFINITIONS.filter(
  (tool): tool is Extract<typeof tool, { type: "function" }> => tool.type === "function",
).map((tool) => ({
  name: tool.function.name,
  description: tool.function.description,
  input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
}));

export class ObservingAnthropicChatClient implements LlmChatClient {
  private readonly client: Anthropic;
  private readonly model: string;
  public readonly calls: ObservedCall[] = [];

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(params: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const startedAt = Date.now();
    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: ANTHROPIC_TOOLS,
      });
    } catch (error) {
      this.calls.push({
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    this.calls.push({ model: response.model, latencyMs: Date.now() - startedAt });

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

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class ObservingOpenRouterChatClient implements LlmChatClient {
  private readonly client: OpenAI;
  private readonly model: string;
  public readonly calls: ObservedCall[] = [];

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
    this.model = model;
  }

  async chat(params: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const startedAt = Date.now();
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: params.systemPrompt },
          ...params.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        tools: RECEPTIONIST_TOOL_DEFINITIONS,
      });
    } catch (error) {
      this.calls.push({
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    this.calls.push({ model: response.model, latencyMs: Date.now() - startedAt });

    const message = response.choices[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).filter(
      (
        call,
      ): call is Extract<NonNullable<typeof message.tool_calls>[number], { type: "function" }> =>
        call.type === "function",
    );

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
