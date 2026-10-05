import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resolveCustomer, resolveService, resolveTenant } from "../../src/db/domain-resolution";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { customers } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";

/** Requires a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`. */
describe("domain resolution — get-or-create bridge to real DB rows", () => {
  const { db, pool } = createTestDb();

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("resolveTenant creates once and returns the same id on subsequent calls", async () => {
    const first = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
    const second = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
    expect(second).toBe(first);
  });

  it("resolveTenant is safe under a concurrent race for the same business", async () => {
    const [a, b] = await Promise.all([
      resolveTenant(db, BAHAMAS_DENTAL_SERVICE),
      resolveTenant(db, BAHAMAS_DENTAL_SERVICE),
    ]);
    expect(a).toBe(b);

    const rows = await db.query.tenants.findMany();
    expect(rows).toHaveLength(1);
  });

  it("resolveService creates once, matches the business's own duration, and is idempotent", async () => {
    const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
    const definition = BAHAMAS_DENTAL_SERVICE.services[0];

    const first = await resolveService(db, tenantId, BAHAMAS_DENTAL_SERVICE, definition.name);
    const second = await resolveService(db, tenantId, BAHAMAS_DENTAL_SERVICE, definition.name);

    expect(first?.serviceId).toBeDefined();
    expect(first?.durationMinutes).toBe(definition.durationMinutes);
    expect(second?.serviceId).toBe(first?.serviceId);
  });

  it("resolveService returns undefined for a name the business doesn't define, rather than inventing a row", async () => {
    const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
    const result = await resolveService(db, tenantId, BAHAMAS_DENTAL_SERVICE, "Teeth Whitening (not offered)");
    expect(result).toBeUndefined();

    const rows = await db.query.services.findMany();
    expect(rows).toHaveLength(0);
  });

  it("resolveCustomer creates once per (tenant, phone) and is idempotent", async () => {
    const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);

    const first = await resolveCustomer(db, tenantId, "+12428012847", "Trevor");
    const second = await resolveCustomer(db, tenantId, "+12428012847", "Trevor");

    expect(second).toBe(first);
    const rows = await db.query.customers.findMany();
    expect(rows).toHaveLength(1);
  });

  it("resolveCustomer updates the display name when the customer gives a different one later", async () => {
    const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);

    const id = await resolveCustomer(db, tenantId, "+12428012847", undefined);
    await resolveCustomer(db, tenantId, "+12428012847", "Trevor");

    const row = await db.query.customers.findFirst({ where: eq(customers.id, id) });
    expect(row?.displayName).toBe("Trevor");
  });

  it("resolveCustomer is safe under a concurrent race for the same phone number", async () => {
    const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);

    const [a, b] = await Promise.all([
      resolveCustomer(db, tenantId, "+12428012847", "Trevor"),
      resolveCustomer(db, tenantId, "+12428012847", "Trevor"),
    ]);
    expect(a).toBe(b);

    const rows = await db.query.customers.findMany();
    expect(rows).toHaveLength(1);
  });

  it("two DIFFERENT phone numbers resolve to two DIFFERENT customers", async () => {
    const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);

    const a = await resolveCustomer(db, tenantId, "+12428012847", "Trevor");
    const b = await resolveCustomer(db, tenantId, "+12428019999", "Sarah");

    expect(a).not.toBe(b);
  });
});
