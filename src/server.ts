import { createApp } from "./app";
import { getEnv } from "./config/env";
import { getDb } from "./db/client";
import { createMessagingProvider } from "./messaging/create-messaging-provider";
import { createDefaultJobRegistry } from "./jobs/default-registry";
import { consoleJobTelemetry } from "./jobs/telemetry";
import { startJobWorker } from "./jobs/worker";
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

// Durable background jobs (BACKGROUND_JOBS.md). Off by default: with JOBS_ENABLED
// unset/false nothing here runs, no job-table polling happens, and the outbox
// above is entirely unaffected. Many processes may run workers at once.
let jobWorker: ReturnType<typeof startJobWorker> | undefined;
if (env.JOBS_ENABLED) {
  jobWorker = startJobWorker(getDb(), {
    registry: createDefaultJobRegistry(),
    pollIntervalMs: env.JOBS_POLL_INTERVAL_MS,
    concurrency: env.JOBS_CONCURRENCY,
  drainTimeoutMs: env.JOBS_SHUTDOWN_TIMEOUT_MS,
    telemetry: consoleJobTelemetry,
  });
}

const httpServer = app.listen(env.PORT, () => {
  console.log(`bahaos-whatsapp-ai-receptionist listening on port ${env.PORT} (${env.NODE_ENV})`);
});

if (jobWorker) {
  const worker = jobWorker;
  const shutdown = (signal: string) => {
    console.log(`${signal}: draining job worker`);
    httpServer.close();
    void worker.stop().finally(() => process.exit(0));
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
