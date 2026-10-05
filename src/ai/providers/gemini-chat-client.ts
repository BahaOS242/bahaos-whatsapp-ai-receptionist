import { GoogleGenAI } from "@google/genai";
import type { FunctionDeclaration } from "@google/genai";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "./llm-chat-client";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "./tool-definitions";

/** Derived from the same RECEPTIONIST_TOOL_DEFINITIONS OpenAiChatClient/
 * AnthropicChatClient use — one source of truth for the 6 tool schemas.
 * Gemini's `parametersJsonSchema` field accepts standard JSON Schema
 * directly, so this is a straight reshape, no Gemini-specific Type-enum
 * conversion needed (unlike Gemini's older `parameters` field). */
const GEMINI_FUNCTION_DECLARATIONS: FunctionDeclaration[] = RECEPTIONIST_TOOL_DEFINITIONS.filter(
  (tool): tool is Extract<typeof tool, { type: "function" }> => tool.type === "function",
).map((tool) => ({
  name: tool.function.name,
  description: tool.function.description,
  parametersJsonSchema: tool.function.parameters,
}));

/** The only file in this codebase that imports the `@google/genai`
 * package — mirrors OpenAiChatClient/AnthropicChatClient's shape,
 * adapted to Gemini's Generative Language API: roles are "user"/"model"
 * (not "assistant"), the system prompt is a top-level `systemInstruction`
 * config field, and a tool call's arguments (`FunctionCall.args`) arrive
 * as an already-parsed object rather than a JSON string. */
export class GeminiChatClient implements LlmChatClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async chat(params: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: params.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: params.systemPrompt,
        tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
      },
    });

    const text = response.text ?? "";
    const toolCalls = (response.functionCalls ?? []).map((call, index) => ({
      // Gemini doesn't require a stable call id to match a function
      // response back (unlike OpenAI/Anthropic) — LLMProvider never reads
      // this field either, so a per-response index is sufficient.
      id: `call_${index}`,
      name: call.name ?? "",
      argumentsJson: JSON.stringify(call.args ?? {}),
    }));

    return { content: text.length > 0 ? text : null, toolCalls };
  }
}
