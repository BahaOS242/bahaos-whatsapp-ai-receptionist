import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env";

describe("loadEnv", () => {
  it("applies documented defaults when optional vars are omitted", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db" });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.OPENROUTER_MODEL).toBe("openrouter/free");
  });

  it("passes GEMINI_API_KEY through when configured", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-custom",
    });

    expect(env.GEMINI_API_KEY).toBe("test-key");
    expect(env.GEMINI_MODEL).toBe("gemini-custom");
  });

  it("passes OPENROUTER_API_KEY through when configured", () => {
    const env = loadEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "openrouter-custom",
    });

    expect(env.OPENROUTER_API_KEY).toBe("test-key");
    expect(env.OPENROUTER_MODEL).toBe("openrouter-custom");
  });

  it("coerces PORT from a string", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", PORT: "4000" });

    expect(env.PORT).toBe(4000);
  });

  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("throws when NODE_ENV is not one of the allowed values", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", NODE_ENV: "staging" }),
    ).toThrow();
  });

  it("throws when PORT is not a positive integer", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", PORT: "-1" }),
    ).toThrow();
  });
});
