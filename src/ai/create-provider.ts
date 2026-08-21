import { getEnv } from "../config/env";
import { GoogleCalendarClient } from "../tools/calendar/google-calendar-client";
import { createGoogleCalendarReceptionistTools } from "../tools/google-calendar-receptionist-tools";
import { createSimulatedReceptionistTools } from "../tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "./business-context";
import { DevRuleBasedAIProvider } from "./providers/dev-rule-based-provider";
import { LLMProvider } from "./providers/llm-provider";
import { OpenAiChatClient } from "./providers/openai-chat-client";
import type { AIProvider, ReceptionistTools } from "./types";

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

/**
 * Picks the real Google Calendar-backed tools when all four
 * GOOGLE_CALENDAR_* vars are configured, and falls back to the in-memory
 * simulated tools otherwise — same zero-configuration-by-default shape
 * as createAiProvider. Single demo tenant (BAHAMAS_DENTAL_SERVICE) only.
 */
export function createReceptionistTools(): ReceptionistTools {
  const env = getEnv();
  if (
    env.GOOGLE_CALENDAR_CLIENT_ID &&
    env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    env.GOOGLE_CALENDAR_REFRESH_TOKEN &&
    env.GOOGLE_CALENDAR_ID
  ) {
    const calendarClient = new GoogleCalendarClient({
      clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      refreshToken: env.GOOGLE_CALENDAR_REFRESH_TOKEN,
      calendarId: env.GOOGLE_CALENDAR_ID,
    });
    return createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendarClient);
  }
  return createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);
}

export { BAHAMAS_DENTAL_SERVICE };
