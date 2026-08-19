import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env";

describe("loadEnv", () => {
  it("applies documented defaults when optional vars are omitted", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db" });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
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
