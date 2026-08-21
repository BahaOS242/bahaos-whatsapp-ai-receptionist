/**
 * Minimal abstraction over "call a chat model with tool-calling support."
 * LLMProvider depends on this interface, not on the OpenAI SDK directly —
 * that's what makes it testable with a fake client and no network access,
 * per the "no live API key in tests" requirement. OpenAiChatClient is the
 * only file that imports the `openai` package.
 */

export interface LlmChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Raw JSON string, exactly as a real API returns it — parsing and
   * validating this is LLMProvider's job, not the client's. */
  argumentsJson: string;
}

export interface LlmChatResult {
  content: string | null;
  toolCalls: LlmToolCall[];
}

export interface LlmChatClient {
  chat(params: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult>;
}
