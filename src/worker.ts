import { getEnv } from "./config/env";
import { getDb } from "./db/client";
import { createDefaultJobRegistry } from "./jobs/default-registry";
import { consoleJobTelemetry } from "./jobs/telemetry";
import { startJobWorker } from "./jobs/worker";

/**
 * Standalone job worker (no HTTP server): `npm run build && npm run worker`.
 * Optional — the web process starts the same worker when JOBS_ENABLED=true.
 * Refuses to start when jobs are disabled so a mis-set flag is loud, not silent.
 */
const env = getEnv();
if (!env.JOBS_ENABLED) {
  console.error("JOBS_ENABLED is not true; refusing to start the job worker.");
  process.exit(1);
}

const worker = startJobWorker(getDb(), {
  registry: createDefaultJobRegistry(),
  pollIntervalMs: env.JOBS_POLL_INTERVAL_MS,
  concurrency: env.JOBS_CONCURRENCY,
  telemetry: consoleJobTelemetry,
});

const shutdown = (signal: string) => {
  console.log(`${signal}: draining job worker`);
  void worker.stop().finally(() => process.exit(0));
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
