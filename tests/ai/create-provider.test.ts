import { describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE, createAiProvider, createReceptionistTools } from "../../src/ai/create-provider";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { loadEnv } from "../../src/config/env";
import { createClinicSimulator } from "../../src/simulator/clinic-simulator";

/**
 * Anthropic-only LLM provider selection — a standing, explicit project
 * constraint (not an implementation preference). Uses loadEnv() with
 * explicit fixture sources (never the real process.env/.env file) so
 * these tests are correct and deterministic regardless of what a
 * developer actually has configured locally — this project's real .env
 * may hold live OpenAI/OpenRouter/Gemini/Anthropic keys, and these tests
 * must prove the selection logic ignores the ones it's supposed to
 * ignore either way.
 */

const BASE = { DATABASE_URL: "postgres://user:pass@localhost:5432/db" };

describe("createAiProvider — Anthropic is the only active LLM provider", () => {
  it("selects an LLMProvider (Anthropic-backed) when ANTHROPIC_API_KEY is configured", () => {
    const env = loadEnv({ ...BASE, ANTHROPIC_API_KEY: "test-anthropic-key" });

    const provider = createAiProvider(env);

    // The only way createAiProvider can return an LLMProvider today is
    // via the Anthropic branch — OpenAI/OpenRouter/Gemini branches were
    // removed from this selection function (their client files still
    // exist, just aren't wired in here), so this assertion alone proves
    // the Anthropic path fired.
    expect(provider).toBeInstanceOf(LLMProvider);
  });

  it("falls back to DevRuleBasedAIProvider when ANTHROPIC_API_KEY is missing", () => {
    const env = loadEnv({ ...BASE });

    const provider = createAiProvider(env);

    expect(provider).toBeInstanceOf(DevRuleBasedAIProvider);
  });

  it("ignores OPENAI_API_KEY, OPENROUTER_API_KEY, and GEMINI_API_KEY even when all are set — no fallback to them", () => {
    const env = loadEnv({
      ...BASE,
      OPENAI_API_KEY: "test-openai-key",
      OPENROUTER_API_KEY: "test-openrouter-key",
      GEMINI_API_KEY: "test-gemini-key",
      // ANTHROPIC_API_KEY deliberately omitted.
    });

    const provider = createAiProvider(env);

    expect(provider).toBeInstanceOf(DevRuleBasedAIProvider);
  });

  it("OPENAI_API_KEY/OPENROUTER_API_KEY/GEMINI_API_KEY being set alongside a configured ANTHROPIC_API_KEY still selects Anthropic", () => {
    const env = loadEnv({
      ...BASE,
      OPENAI_API_KEY: "test-openai-key",
      OPENROUTER_API_KEY: "test-openrouter-key",
      GEMINI_API_KEY: "test-gemini-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    });

    const provider = createAiProvider(env);

    expect(provider).toBeInstanceOf(LLMProvider);
  });

  it("an invalid (empty-string) ANTHROPIC_API_KEY fails safely at env validation, not with a broken provider", () => {
    // Same documented behavior as OPENAI_API_KEY/OPENROUTER_API_KEY/
    // GEMINI_API_KEY: an explicitly-empty credential fails loudly and
    // immediately (a clear startup error) rather than silently
    // constructing a client with a blank key that would only fail later,
    // opaquely, on first use.
    expect(() => loadEnv({ ...BASE, ANTHROPIC_API_KEY: "" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("ANTHROPIC_MODEL defaults to claude-haiku-4-5-20251001 so ANTHROPIC_API_KEY alone is sufficient to activate the LLM path", () => {
    const env = loadEnv({ ...BASE, ANTHROPIC_API_KEY: "test-anthropic-key" });

    expect(env.ANTHROPIC_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(() => createAiProvider(env)).not.toThrow();
  });
});

/**
 * createReceptionistTools's three implementations (database/Google
 * Calendar/simulated) are plain object literals from factory functions,
 * not classes, so `toBeInstanceOf` can't distinguish them the way
 * createAiProvider's tests do above. Distinguish behaviorally instead: a
 * deliberately broken `db` stub (no real Drizzle shape at all) makes the
 * database-backed tools throw the moment they try to use it, while the
 * simulated tools never reference `db` at all and resolve normally with
 * the exact same stub — proving which implementation was actually
 * selected without introducing module mocking into this codebase's
 * established real-object testing style.
 */
describe("createReceptionistTools — DB_BOOKING_ENABLED selects the real database-backed tools", () => {
  const bookingPayload = {
    service: "Routine cleaning",
    preferredDate: "Monday" as const,
    preferredTime: "10:00",
    name: "Test Customer",
    phone: "2428010000",
  };

  it("routes requestAppointment through the injected db when DB_BOOKING_ENABLED=true", async () => {
    const env = loadEnv({ ...BASE, DB_BOOKING_ENABLED: "true" });
    const brokenDb = {} as never;

    const tools = createReceptionistTools(env, brokenDb);

    await expect(tools.requestAppointment(bookingPayload)).rejects.toThrow();
  });

  it("falls back to the in-memory simulated tools when DB_BOOKING_ENABLED is unset — never touches the injected db", async () => {
    const env = loadEnv({ ...BASE });
    const brokenDb = {} as never;

    const tools = createReceptionistTools(env, brokenDb);

    const result = await tools.requestAppointment(bookingPayload);
    expect(result.success).toBe(true);
  });
});

/**
 * Regression test for a genuine live-found footgun: an explicitly-passed
 * `clinicSimulator` used to be silently ignored unless
 * CLINIC_SIMULATOR_ENABLED was ALSO set on env, so a caller that wired a
 * real ClinicSimulator (for `checkAvailability`, or to assert against
 * directly) still had `requestAppointment` fall through to the plain,
 * no-real-calendar `createSimulatedReceptionistTools` — the conversational
 * layer and the actual booking path disagreed about whether a seeded slot
 * was free. Distinguish the real clinic-simulator tools from the plain
 * simulated tools the same behavioral way the DB_BOOKING_ENABLED tests
 * above do: seed a KNOWN conflicting slot directly on the simulator (not
 * assumed — read back via checkBookable first) and prove requestAppointment
 * rejects it. The plain simulated tools have no concept of the reference
 * calendar at all and would succeed regardless.
 */
describe("createReceptionistTools — an explicitly-passed clinicSimulator activates the real clinic-simulator tools on its own", () => {
  it("routes requestAppointment through the injected clinicSimulator even when CLINIC_SIMULATOR_ENABLED is unset", async () => {
    const env = loadEnv({ ...BASE });
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);

    // 2026-09-18 09:30 is seeded in test-data/clinic-calendar as a booked
    // consultation — confirm it's genuinely a conflict before relying on it.
    const seeded = simulator.checkBookable("2026-09-18", "09:30", 30);
    expect(seeded).toEqual({ ok: false, reason: "conflict" });

    const tools = createReceptionistTools(env, undefined, simulator);

    const result = await tools.requestAppointment({
      service: "Dental consultation / basic exam",
      preferredDate: "2026-09-18",
      preferredTime: "09:30",
      name: "Test Customer",
      phone: "2428010000",
    });

    expect(result.success).toBe(false);
    expect(result.recoverable?.reason).toBe("slot_conflict");
  });
});
