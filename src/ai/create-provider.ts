import { getEnv } from "../config/env";
import type { Env } from "../config/env";
import { getDb } from "../db/client";
import { GoogleCalendarClient } from "../tools/calendar/google-calendar-client";
import { createDatabaseReceptionistTools } from "../tools/database-receptionist-tools";
import { createGoogleCalendarReceptionistTools } from "../tools/google-calendar-receptionist-tools";
import { createSimulatedReceptionistTools } from "../tools/receptionist-tools";
import { createClinicSimulatorReceptionistTools } from "../tools/clinic-simulator-receptionist-tools";
import { createClinicSimulator, type ClinicSimulator } from "../simulator/clinic-simulator";
import { BAHAMAS_DENTAL_SERVICE } from "./business-context";
import {
  createDbLanguageObservationRecorder,
  noopLanguageObservationRecorder,
  type LanguageObservationRecorder,
} from "./language-observation-recorder";
import { AnthropicChatClient } from "./providers/anthropic-chat-client";
import { DevRuleBasedAIProvider } from "./providers/dev-rule-based-provider";
import { LLMProvider } from "./providers/llm-provider";
import type { AIProvider, ReceptionistTools } from "./types";

/**
 * Anthropic is the ONLY active LLM provider — falls back to the
 * deterministic rule-based provider when ANTHROPIC_API_KEY isn't
 * configured (missing OR failing env validation, e.g. an empty string),
 * so local dev and any future API route still work with zero
 * configuration. ANTHROPIC_API_KEY/ANTHROPIC_MODEL are the only
 * credentials this function reads.
 *
 * OPENAI_API_KEY/OPENROUTER_API_KEY/GEMINI_API_KEY are intentionally NOT
 * consulted here — OpenAiChatClient, OpenRouterChatClient, and
 * GeminiChatClient still exist fully intact
 * (src/ai/providers/openai-chat-client.ts, openrouter-chat-client.ts,
 * gemini-chat-client.ts) and satisfy the same LlmChatClient interface,
 * but must never be wired in here: Anthropic is a standing, explicit
 * project constraint, not an implementation preference.
 *
 * `env` defaults to the real getEnv() singleton for every real caller
 * (server.ts, scripts/dev-chat.ts, ...); the optional parameter exists so
 * tests can pass a fixture Env directly instead of depending on the
 * developer's actual local .env file (which may hold real keys this
 * function must be proven to ignore).
 */
export function createAiProvider(env: Env = getEnv()): AIProvider {
  if (env.ANTHROPIC_API_KEY) {
    return new LLMProvider(new AnthropicChatClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL));
  }
  return new DevRuleBasedAIProvider();
}

/**
 * Picks the real, concurrency-safe Postgres-backed tools
 * (createDatabaseReceptionistTools) when DB_BOOKING_ENABLED is explicitly
 * set — this is the actual production booking path (see
 * src/db/appointments.ts's exclusion-constraint-protected
 * createAppointment and src/tools/database-receptionist-tools.ts), and
 * takes priority over Google Calendar when both are configured, since it
 * is the one system with real concurrency safety. Falls back to the
 * Google Calendar-backed tools when all four GOOGLE_CALENDAR_* vars are
 * configured, and to the in-memory simulated tools otherwise — same
 * zero-configuration-by-default shape as createAiProvider. Single demo
 * tenant (BAHAMAS_DENTAL_SERVICE) only.
 *
 * DB_BOOKING_ENABLED is a deliberate, explicit opt-in (not inferred from
 * DATABASE_URL, which is always required for other reasons) so an
 * existing deployment without the booking migrations applied is never
 * silently switched onto a schema it doesn't have.
 *
 * `env`/`db` default to the real singletons for every real caller
 * (server.ts, scripts/dev-chat.ts, ...); the optional parameters exist so
 * tests can pass fixtures directly, mirroring createAiProvider's `env`
 * parameter. `getDb()`'s pool connects lazily on first query (see
 * src/db/client.ts), so evaluating it as a default costs nothing when the
 * database branch isn't taken.
 */
export function createReceptionistTools(
  env: Env = getEnv(),
  db: ReturnType<typeof getDb> = getDb(),
  // Optional injection point purely for test/caller convenience — e.g.
  // dev-chat.ts wants ONE simulator instance to persist for the whole
  // session, and tests want direct access to the same instance they're
  // asserting against (seeding bookings, checking calendar state, the
  // reference-integrity check). Omitted, a fresh simulator (a fresh read
  // of the reference calendar + an empty transaction log) is created.
  //
  // Genuine API footgun found live: this parameter used to be silently
  // IGNORED unless env.CLINIC_SIMULATOR_ENABLED was ALSO true — a caller
  // that explicitly constructs and passes a ClinicSimulator obviously
  // intends to use it, but without the separate env flag also set, every
  // booking silently fell through to the plain, no-real-calendar
  // createSimulatedReceptionistTools instead. Caught it firsthand: a
  // live verification script wired `checkAvailability` straight to a
  // real simulator (so the CONVERSATIONAL layer correctly saw seeded
  // conflicts) while `requestAppointment` quietly went through the OLD
  // tools — the confirmation and the actual booking disagreed about
  // whether a seeded slot was free. Passing a simulator now activates
  // it on its own, exactly as any caller would expect.
  clinicSimulator?: ClinicSimulator,
): ReceptionistTools {
  if (env.CLINIC_SIMULATOR_ENABLED || clinicSimulator) {
    return createClinicSimulatorReceptionistTools(clinicSimulator ?? createClinicSimulator(BAHAMAS_DENTAL_SERVICE));
  }
  if (env.DB_BOOKING_ENABLED) {
    return createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db);
  }
  if (
    env.GOOGLE_CALENDAR_CLIENT_ID &&
    env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    env.GOOGLE_CALENDAR_REFRESH_TOKEN &&
    env.GOOGLE_CALENDAR_ID
  ) {
    const calendarClient = new GoogleCalendarClient({
      clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      refreshToken: env.GOOGLE_CALENDAR_REFRESH_TOKEN,
      calendarId: env.GOOGLE_CALENDAR_ID,
    });
    return createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendarClient);
  }
  return createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);
}

/**
 * Item 5 — unknown-phrase learning foundation. Real, DB-backed recording
 * only when DB_BOOKING_ENABLED (same explicit opt-in as
 * createReceptionistTools, for the same reason — never write to a
 * schema that might not have this migration applied); a no-op
 * otherwise, so every caller not using durable persistence (dev-chat.ts
 * by default, most tests) behaves exactly as before this feature
 * existed. Recording is purely observational — see
 * LanguageObservationRecorder's own docstring — so this being a no-op
 * changes nothing about booking behavior either way.
 */
export function createLanguageObservationRecorder(
  env: Env = getEnv(),
  db: ReturnType<typeof getDb> = getDb(),
): LanguageObservationRecorder {
  if (env.DB_BOOKING_ENABLED) {
    return createDbLanguageObservationRecorder(BAHAMAS_DENTAL_SERVICE, db);
  }
  return noopLanguageObservationRecorder;
}

export { BAHAMAS_DENTAL_SERVICE };
