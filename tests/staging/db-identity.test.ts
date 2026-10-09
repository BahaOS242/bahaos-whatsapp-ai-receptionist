import { describe, expect, it } from "vitest";
import { assertApprovedStagingDb, parseDbIdentity } from "../../scripts/staging/db-identity";

const URL = "postgres://user:secret@dpg-abc.oregon-postgres.render.com:5432/bahaos_staging";
const ENV = { STAGING_DB_HOST: "dpg-abc.oregon-postgres.render.com", STAGING_DB_NAME: "bahaos_staging" };

describe("staging database identity guard", () => {
  it("parses host and database without credentials", () => {
    expect(parseDbIdentity(URL)).toEqual({ host: "dpg-abc.oregon-postgres.render.com", database: "bahaos_staging" });
  });
  it("accepts exactly the approved host and database", () => {
    expect(assertApprovedStagingDb(URL, ENV).database).toBe("bahaos_staging");
  });
  it("refuses a different host, a different database, and missing approval variables", () => {
    expect(() => assertApprovedStagingDb(URL.replace("dpg-abc", "dpg-other"), ENV)).toThrow(/Refusing/);
    expect(() => assertApprovedStagingDb(URL.replace("bahaos_staging", "prod"), ENV)).toThrow(/Refusing/);
    expect(() => assertApprovedStagingDb(URL, {})).toThrow(/must both be set/);
    expect(() => assertApprovedStagingDb(URL, { STAGING_DB_HOST: ENV.STAGING_DB_HOST })).toThrow(/must both be set/);
    expect(() => assertApprovedStagingDb(undefined, ENV)).toThrow(/not set/);
  });
  it("has no override: the old STAGING_INIT_CONFIRM flag changes nothing", () => {
    expect(() => assertApprovedStagingDb(URL.replace("bahaos_staging", "prod"), { ...ENV, STAGING_INIT_CONFIRM: "yes" })).toThrow(/Refusing/);
  });
  it("never echoes credentials from a doubled/malformed URL", () => {
    const doubled = URL + URL; // the real-world mistake: the URL pasted twice
    let msg = "";
    try { assertApprovedStagingDb(doubled, ENV); } catch (e) { msg = String(e); }
    expect(msg).toMatch(/Refusing/);
    expect(msg).not.toContain("secret");
    expect(msg).not.toContain("postgres://");
    expect(msg).toContain("not shown");
  });
  it("never echoes the password", () => {
    try { assertApprovedStagingDb(URL.replace("bahaos_staging", "prod"), ENV); } catch (e) { expect(String(e)).not.toContain("secret"); }
  });
});
