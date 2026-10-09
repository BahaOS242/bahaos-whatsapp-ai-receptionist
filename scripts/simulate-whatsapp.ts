/**
 * Phase 7 — local development mode: drives the EXACT same path a real
 * WhatsApp webhook delivery would (PersistedConversationManager ->
 * ReceptionistAgent -> ReceptionistTools -> MessagingProvider), against
 * a real Postgres, WITHOUT contacting Meta at all — no WhatsApp
 * credentials required or read. Each line you type becomes a normalized
 * inbound message with a freshly-generated whatsappMessageId, processed
 * through processInboundWhatsAppMessage exactly like the real webhook
 * route (src/routes/whatsapp-webhook.ts) does, then delivered through
 * the durable outbox worker over createMockMessagingProvider (logged to
 * this console, never a real network call).
 *
 * Requires DATABASE_URL (this project's normal dev database, migrated)
 * — this is the persisted, restart-surviving path, not the in-memory
 * ConversationManager scripts/dev-chat.ts uses. Run with
 * `npx tsx scripts/simulate-whatsapp.ts <your phone number>`.
 */
import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";
import {
  BAHAMAS_DENTAL_SERVICE,
  createAiProvider,
  createLanguageObservationRecorder,
  createReceptionistTools,
} from "../src/ai/create-provider";
import { ReceptionistAgent } from "../src/ai/receptionist-agent";
import { getDb } from "../src/db/client";
import { createMockMessagingProvider } from "../src/messaging/mock-messaging-provider";
import { drainConversation } from "../src/messaging/outbox-worker";
import { processInboundWhatsAppMessage } from "../src/whatsapp/webhook-processing";

async function main() {
  const phone = process.argv[2] ?? "+12428012847";
  const name = process.argv[3];

  const db = getDb();
  const agent = new ReceptionistAgent(
    createAiProvider(),
    createReceptionistTools(),
    createLanguageObservationRecorder(),
  );
  const messaging = createMockMessagingProvider();

  console.log(`\nSimulated WhatsApp session for ${phone} (no real Meta contact — mock outbound transport)`);
  console.log(`Provider: ${createAiProvider().constructor.name}`);
  console.log("Type a message and press enter. Ctrl+C to quit.\n");

  const rl = readline.createInterface({ input: stdin, output: stdout });

  for (;;) {
    const message = await rl.question("You (WhatsApp): ");
    if (!message.trim()) continue;

    const outcome = await processInboundWhatsAppMessage(
      { db, business: BAHAMAS_DENTAL_SERVICE, agent },
      { phone, message, whatsappMessageId: `wamid.sim.${randomUUID()}`, name },
    );

    if (outcome.wasDuplicate) {
      console.log("(duplicate whatsappMessageId — no-op, exactly as a real webhook retry would be)\n");
      continue;
    }
    if (outcome.reply && outcome.outboundMessageId) {
      // The same durable path production uses: the reply was queued in the
      // outbox by processInboundWhatsAppMessage; deliver it through the
      // outbox worker (mock transport) — never a direct send.
      await drainConversation(db, messaging, outcome.conversationId);
    }
    console.log(`conversationId: ${outcome.conversationId} | handoffActive: ${outcome.handoffActive}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
