import { getEnv } from "../config/env";
import { BAHAMAS_DENTAL_SERVICE } from "./business-context";
import { DevRuleBasedAIProvider } from "./providers/dev-rule-based-provider";
import { LLMProvider } from "./providers/llm-provider";
import { OpenAiChatClient } from "./providers/openai-chat-client";
import type { AIProvider } from "./types";

/**
 * Picks the real LLM provider when OPENAI_API_KEY is configured, and
 * falls back to the deterministic rule-based provider otherwise — so
 * local dev and any future API route work with zero configuration, and
 * only opt into a real (billed) LLM call when a key is actually present.
 */
export function createAiProvider(): AIProvider {
  const env = getEnv();
  if (env.OPENAI_API_KEY) {
    return new LLMProvider(new OpenAiChatClient(env.OPENAI_API_KEY, env.OPENAI_MODEL));
  }
  return new DevRuleBasedAIProvider();
}

export { BAHAMAS_DENTAL_SERVICE };
