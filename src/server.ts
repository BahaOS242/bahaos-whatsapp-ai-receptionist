import { createApp } from "./app";
import { getEnv } from "./config/env";
import { getDb } from "./db/client";
import { createMessagingProvider } from "./messaging/create-messaging-provider";
import { startOutboundRetryPoller } from "./messaging/outbound-retry-worker";

const env = getEnv();
const app = createApp();

// The whole "background job" mechanism the outbound retry mechanism
// needs — see outbound-retry-worker.ts's own docstring for why this is
// an in-process poller (safe under horizontal scaling via Postgres's
// own SKIP LOCKED) rather than a separate queue/worker service. Started
// unconditionally: with no failed/retry_pending messages this is just
// an empty, indexed query every OUTBOUND_RETRY_POLL_INTERVAL_MS, and the
// messaging provider it uses already degrades to the mock transport
// with no WhatsApp credentials configured (see
// create-messaging-provider.ts), so this never requires anything
// beyond what the rest of the app already needs to run.
startOutboundRetryPoller(getDb(), createMessagingProvider(env), env.OUTBOUND_RETRY_POLL_INTERVAL_MS);

app.listen(env.PORT, () => {
  console.log(`bahaos-whatsapp-ai-receptionist listening on port ${env.PORT} (${env.NODE_ENV})`);
});
