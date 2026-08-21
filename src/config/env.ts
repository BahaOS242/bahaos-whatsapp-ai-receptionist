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
  GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().min(1).optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
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
