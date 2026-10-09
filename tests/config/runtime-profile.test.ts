import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env";
import {
  assertSafeRuntimeProfile,
  describeRuntimeProfile,
  resolveRuntimeProfile,
  RuntimeProfileError,
} from "../../src/config/runtime-profile";

const BASE = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };
const GOOGLE = {
  GOOGLE_CALENDAR_CLIENT_ID: "id",
  GOOGLE_CALENDAR_CLIENT_SECRET: "secret-google",
  GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-google",
  GOOGLE_CALENDAR_ID: "cal",
};
const WA_OUT = { WHATSAPP_ACCESS_TOKEN: "EAAsecrettoken", WHATSAPP_PHONE_NUMBER_ID: "123" };
const profile = (extra: Record<string, string>) => resolveRuntimeProfile(loadEnv({ ...BASE, ...extra }));

describe("resolveRuntimeProfile: booking backend (same precedence as createReceptionistTools)", () => {
  it("defaults to the demo in-memory tools", () => expect(profile({}).bookingBackend).toBe("demo_in_memory"));
  it("DB_BOOKING_ENABLED=true -> database", () => expect(profile({ DB_BOOKING_ENABLED: "true" }).bookingBackend).toBe("database"));
  it("DB_BOOKING_ENABLED=false -> demo", () => expect(profile({ DB_BOOKING_ENABLED: "false" }).bookingBackend).toBe("demo_in_memory"));
  it("all four Google vars -> google_calendar; three of four -> demo", () => {
    expect(profile(GOOGLE).bookingBackend).toBe("google_calendar");
    const { GOOGLE_CALENDAR_ID: _omit, ...three } = GOOGLE;
    expect(profile(three).bookingBackend).toBe("demo_in_memory");
  });
  it("database beats google; the clinic simulator beats both", () => {
    expect(profile({ ...GOOGLE, DB_BOOKING_ENABLED: "true" }).bookingBackend).toBe("database");
    expect(profile({ ...GOOGLE, DB_BOOKING_ENABLED: "true", CLINIC_SIMULATOR_ENABLED: "true" }).bookingBackend).toBe("clinic_simulator");
  });
});

describe("resolveRuntimeProfile: messaging and AI", () => {
  it("needs BOTH whatsapp token and phone number id for real sending", () => {
    expect(profile({}).messaging).toBe("mock");
    expect(profile({ WHATSAPP_ACCESS_TOKEN: "EAAx" }).messaging).toBe("mock");
    expect(profile({ WHATSAPP_PHONE_NUMBER_ID: "1" }).messaging).toBe("mock");
    expect(profile(WA_OUT).messaging).toBe("whatsapp");
  });
  it("Anthropic key -> anthropic, otherwise the rule-based fallback; other providers' keys are ignored", () => {
    expect(profile({}).aiProvider).toBe("rule_based");
    expect(profile({ OPENAI_API_KEY: "x", GEMINI_API_KEY: "y", OPENROUTER_API_KEY: "z" }).aiProvider).toBe("rule_based");
    expect(profile({ ANTHROPIC_API_KEY: "sk-ant-x" }).aiProvider).toBe("anthropic");
  });
  it("reports webhook signature verification and the optional engines", () => {
    const p = profile({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v", WHATSAPP_APP_SECRET: "s", JOBS_ENABLED: "true" });
    expect(p.webhook).toEqual({ inboundConfigured: true, signatureVerification: true });
    expect(p.flags).toEqual({ knowledge: false, memory: false, jobs: true });
    expect(profile({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v" }).webhook.signatureVerification).toBe(false);
  });
});

describe("describeRuntimeProfile never leaks secrets", () => {
  it("prints the profile without any credential value", () => {
    const text = describeRuntimeProfile(
      profile({ NODE_ENV: "production", ...GOOGLE, ...WA_OUT, ANTHROPIC_API_KEY: "sk-ant-SECRETVALUE", WHATSAPP_APP_SECRET: "appsecretvalue", DB_BOOKING_ENABLED: "true" }),
    );
    expect(text).toContain("bookingBackend=database");
    expect(text).toContain("messaging=whatsapp");
    for (const secret of ["SECRETVALUE", "EAAsecrettoken", "appsecretvalue", "secret-google", "refresh-google", "postgres://"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("assertSafeRuntimeProfile: production guard", () => {
  const check = (extra: Record<string, string>) => {
    const env = loadEnv({ ...BASE, ...extra });
    return () => assertSafeRuntimeProfile(resolveRuntimeProfile(env), env);
  };
  it("THE STAGING MISTAKE: production + DB_BOOKING_ENABLED missing -> refuses to start", () => {
    expect(check({ NODE_ENV: "production", ...WA_OUT, WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v" })).toThrow(RuntimeProfileError);
    expect(check({ NODE_ENV: "production" })).toThrow(/DB_BOOKING_ENABLED/);
  });
  it("refuses the clinic simulator in production too", () => {
    expect(check({ NODE_ENV: "production", CLINIC_SIMULATOR_ENABLED: "true" })).toThrow(/in-memory/);
  });
  it("refuses an inbound WhatsApp webhook with the mock transport in production", () => {
    expect(check({ NODE_ENV: "production", DB_BOOKING_ENABLED: "true", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v" })).toThrow(/WHATSAPP_ACCESS_TOKEN/);
  });
  it("passes a correct production profile (database + real WhatsApp)", () => {
    expect(check({ NODE_ENV: "production", DB_BOOKING_ENABLED: "true", ...WA_OUT, WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v" })).not.toThrow();
    expect(check({ NODE_ENV: "production", ...GOOGLE, ...WA_OUT })).not.toThrow(); // google calendar is durable
  });
  it("only the explicit override allows demo tools in production", () => {
    expect(check({ NODE_ENV: "production", ALLOW_DEMO_TOOLS_IN_PRODUCTION: "true" })).not.toThrow();
    expect(() => loadEnv({ ...BASE, NODE_ENV: "production", ALLOW_DEMO_TOOLS_IN_PRODUCTION: "yes" })).toThrow(/Invalid environment/); // not an exact "true"/"false"
  });
  it("development and test are never blocked", () => {
    expect(check({})).not.toThrow();
    expect(check({ NODE_ENV: "test", CLINIC_SIMULATOR_ENABLED: "true" })).not.toThrow();
  });
  it("the error message names the fix and leaks no values", () => {
    try {
      check({ NODE_ENV: "production", WHATSAPP_APP_SECRET: "appsecretvalue" })();
    } catch (e) {
      expect(String(e)).toMatch(/DB_BOOKING_ENABLED=true/);
      expect(String(e)).not.toContain("appsecretvalue");
    }
  });
});
