import type { MessagingProvider, OutboundMessageResult } from "./messaging-provider";

export interface SentMessage {
  to: string;
  body: string;
  at: Date;
}

export interface MockMessagingProvider extends MessagingProvider {
  /** Every message sent through this provider, oldest first — what
   * tests assert against instead of a real WhatsApp delivery. */
  readonly sent: SentMessage[];
}

/**
 * In-memory transport — no network, no credentials — for automated
 * tests and local development without WhatsApp credentials configured
 * (Phase 7's explicit requirement: npm test/test:db/npm run chat must
 * never require them). Logs each send to the console (visible in
 * `npm run chat`-style manual runs, matching how the simulated
 * ReceptionistTools already log every tool call) and records it in
 * `sent` for test assertions. Never fails — a real transport can fail
 * for real reasons (see whatsapp-messaging-provider.ts); this one exists
 * specifically to let everything ELSE (webhook parsing, persistence,
 * idempotency, ReceptionistAgent wiring) be exercised deterministically
 * without also depending on network reliability.
 */
export function createMockMessagingProvider(): MockMessagingProvider {
  const sent: SentMessage[] = [];
  return {
    sent,
    async sendText(to: string, body: string): Promise<OutboundMessageResult> {
      console.log(`[mock WhatsApp] -> ${to}: ${body}`);
      sent.push({ to, body, at: new Date() });
      return { success: true, providerMessageId: `mock-${sent.length}` };
    },
  };
}
