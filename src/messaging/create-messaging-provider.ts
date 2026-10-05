import { getEnv, type Env } from "../config/env";
import { createWhatsAppMessagingProvider } from "./whatsapp-messaging-provider";
import { createMockMessagingProvider, type MockMessagingProvider } from "./mock-messaging-provider";
import type { MessagingProvider } from "./messaging-provider";

/**
 * Selection logic mirroring createReceptionistTools's own
 * zero-configuration-by-default shape (src/ai/create-provider.ts):
 * real WhatsApp sending only when BOTH WHATSAPP_ACCESS_TOKEN and
 * WHATSAPP_PHONE_NUMBER_ID are configured, the mock transport otherwise
 * — so `npm test`/`npm run test:db`/`npm run chat` never require
 * WhatsApp credentials (Phase 7's explicit requirement), and a real
 * deployment opts in by setting real values, exactly like
 * DB_BOOKING_ENABLED/GOOGLE_CALENDAR_*.
 */
export function createMessagingProvider(env: Env = getEnv()): MessagingProvider {
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    return createWhatsAppMessagingProvider({
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      apiVersion: env.WHATSAPP_API_VERSION,
    });
  }
  return createMockMessagingProvider();
}

export type { MockMessagingProvider };
