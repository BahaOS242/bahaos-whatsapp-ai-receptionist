import "dotenv/config";
import { z } from "zod";

/**
 * Vars for phases not yet built (WhatsApp, email, Railway) are documented
 * in .env.example but intentionally not validated or read here yet.
 * OPENAI_API_KEY/OPENAI_MODEL and the GOOGLE_CALENDAR_* vars are the
 * exception: both the LLM receptionist provider and the real-calendar
 * ReceptionistTools are implemented, but every one of these stays
 * optional here — DevRuleBasedAIProvider and createSimulatedReceptionistTools
 * require no credentials at all, and nothing at startup should fail just
 * because a developer hasn't configured real integrations yet.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).default("openrouter/free"),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().min(1).optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
  // Explicit opt-in only — DATABASE_URL is always required (used for
  // other things too), so its mere presence can't imply the booking
  // schema's migrations (drizzle/0000.../0001.../0002...) have actually
  // been applied. Defaults to disabled so existing deployments are
  // unaffected until someone deliberately turns this on.
  DB_BOOKING_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  // Explicit opt-in, same shape as DB_BOOKING_ENABLED — routes booking
  // through the clinic simulator (test-data/clinic-calendar/'s immutable
  // reference calendar + an in-memory transaction layer) instead of the
  // plain in-memory simulated tools. Checked BEFORE DB_BOOKING_ENABLED in
  // createReceptionistTools, since turning this on is an explicit,
  // deliberate choice to exercise the simulator specifically.
  CLINIC_SIMULATOR_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  // Business-knowledge (RAG) engine — see KNOWLEDGE_ENGINE.md. Explicit
  // opt-in, same shape as DB_BOOKING_ENABLED/CLINIC_SIMULATOR_ENABLED, and
  // for the same reason: the knowledge tables come from migration 0007, and
  // nothing should start querying a schema a deployment may not have yet.
  // With the flag off the receptionist behaves exactly as it did before
  // the engine existed.
  KNOWLEDGE_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  // Customer & conversation memory — see MEMORY_ENGINE.md. Explicit opt-in,
  // default off, same shape as KNOWLEDGE_ENABLED. Off => no extraction, no
  // retrieval, no prompt change, no queries against customer_memories.
  MEMORY_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  // Durable background jobs — see BACKGROUND_JOBS.md. Explicit opt-in, default
  // off, independent of MEMORY_ENABLED and of the WhatsApp outbox. Off => no
  // job worker is started and nothing polls the job table.
  JOBS_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  // Explicit override for the production startup guard (src/config/runtime-profile.ts). Off by default: in production the
  // app refuses to start with demo/in-memory booking tools or an inbound webhook with the mock outbound transport.
  ALLOW_DEMO_TOOLS_IN_PRODUCTION: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(5_000),
  JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  // Upper bound on graceful shutdown (pending claim + running handlers). Beyond it work is abandoned to lease recovery.
  JOBS_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(20_000),
  // Optional remote embeddings (Voyage AI — Anthropic's recommended
  // embeddings partner). Absent => the offline hashing embedder, so local
  // dev and every test need no credentials. OpenAI is deliberately not an
  // option here (standing project constraint).
  VOYAGE_API_KEY: z.string().min(1).optional(),
  VOYAGE_EMBEDDING_MODEL: z.string().min(1).default("voyage-3.5-lite"),
  // WhatsApp Cloud API (Meta) — all optional, matching the GOOGLE_CALENDAR_*
  // pattern above: the webhook route is always mounted (so ops can point
  // Meta's console at it and see a clear 403 rather than a 404), but each
  // piece of behavior degrades explicitly rather than requiring all four:
  //   - WHATSAPP_WEBHOOK_VERIFY_TOKEN alone enables the GET verification
  //     challenge (Meta's one-time webhook setup step).
  //   - WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID together enable
  //     real outbound sending (createMessagingProvider falls back to an
  //     in-memory mock transport otherwise — see
  //     src/messaging/create-messaging-provider.ts) — never required for
  //     npm test/test:db/npm run chat.
  //   - WHATSAPP_APP_SECRET enables X-Hub-Signature-256 verification of
  //     inbound webhook payloads; its absence is logged, not silently
  //     ignored (see src/whatsapp/webhook-signature.ts).
  // Never hardcoded, never logged.
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_API_VERSION: z.string().min(1).default("v21.0"),
  // How often server.ts's in-process OUTBOX worker polls (see
  // src/messaging/outbox-worker.ts). It drives retries AND is the
  // crash/restart backstop for first-attempt deliveries (the webhook also
  // makes one inline attempt after COMMIT, so this is not on the hot
  // path). 5s: a message whose process died after commit still reaches
  // the customer within seconds; the query is an indexed, normally-empty
  // scan. The retry BACKOFF itself (30s/1m/2m/4m) is independent.
  OUTBOUND_RETRY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

/**
 * Lazy singleton, mirroring src/db/client.ts's lazy pool: env validation
 * only runs on first use, not on module import. This keeps importing this
 * module side-effect-free, which matters for tests that only want to
 * exercise `loadEnv` directly against fixture values.
 */
let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}
