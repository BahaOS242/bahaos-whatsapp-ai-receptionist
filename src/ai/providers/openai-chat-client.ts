import OpenAI from "openai";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "./llm-chat-client";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "./tool-definitions";

/** The only file in this codebase that imports the `openai` package. */
export class OpenAiChatClient implements LlmChatClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
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

    return {
      content: message?.content ?? null,
      toolCalls: toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        argumentsJson: call.function.arguments,
      })),
    };
  }
}
