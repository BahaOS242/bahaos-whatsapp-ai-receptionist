import { getEnv } from "./config/env";
import { getDb, getPool } from "./db/client";
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

// An idle pooled connection dying (database restart, network drop) emits 'error' on the pool; with no
// listener Node would crash. The poller already backs off and retries, so just record it.
getPool().on("error", (e) => console.error(JSON.stringify({ scope: "jobs", event: "pool_error", error: e.name })));
process.on("unhandledRejection", (e) => console.error(JSON.stringify({ scope: "jobs", event: "unhandled_rejection", error: e instanceof Error ? e.name : "unknown" })));

// keepAlive: this process has nothing else holding the event loop open. Without it, a database that is
// DOWN (no sockets, only an unref'd timer) lets Node exit with code 0 — a supervisor would see a clean
// exit instead of a worker that should be retrying.
const worker = startJobWorker(getDb(), {
  keepAlive: true,
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
