import { createApp } from "./app";
import { getEnv } from "./config/env";
import { getDb } from "./db/client";
import { createMessagingProvider } from "./messaging/create-messaging-provider";
import { startOutboxPoller } from "./messaging/outbox-worker";

const env = getEnv();
const app = createApp();

// Durable outbound delivery (see src/messaging/outbox.ts and OUTBOX.md).
// Replies are queued in Postgres inside the business transaction; this
// in-process poller is the retry driver and the crash/restart backstop.
// Safe to run in many processes at once (SKIP LOCKED + leases), so
// scaling the web process scales the worker, with no extra deployment
// artifact. Started unconditionally: with nothing due it is an empty,
// indexed query every OUTBOUND_RETRY_POLL_INTERVAL_MS, and the messaging
// provider degrades to the mock transport with no WhatsApp credentials.
startOutboxPoller(getDb(), createMessagingProvider(env), env.OUTBOUND_RETRY_POLL_INTERVAL_MS);

app.listen(env.PORT, () => {
  console.log(`bahaos-whatsapp-ai-receptionist listening on port ${env.PORT} (${env.NODE_ENV})`);
});
