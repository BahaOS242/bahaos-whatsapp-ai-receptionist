import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAppointment } from "../../src/db/appointments";
import { appointments } from "../../src/db/schema";
import { createTestDb, resetTestData, seedFixtures } from "./db-test-helpers";
import type { Fixtures } from "./db-test-helpers";

/**
 * Proves the actual production-integrity requirement: two customers must
 * never both successfully book the same provider/resource's overlapping
 * time slot, even when their requests race. This is deliberately tested
 * against a REAL Postgres instance with genuinely concurrent requests
 * (Promise.all, not sequential awaits) — an in-memory mock or a
 * sequential test could pass without proving anything about the actual
 * exclusion-constraint mechanism, since Node's single-threaded event
 * loop combined with a naive check-then-act mock would never surface a
 * real race at all.
 *
 * REQUIRES a real, reachable Postgres database with this project's
 * migrations applied (see drizzle/0000.../0001.../0002...). Not run by
 * `npm test` (see vitest.db.config.mts) — run explicitly via:
 *
 *   npm run test:db
 *
 * Local setup used to build/verify this suite:
 *   brew install postgresql@16
 *   (start postgres — see project notes)
 *   createdb bahaos_concurrency_test
 *   DATABASE_URL=postgres://localhost:5432/bahaos_concurrency_test npx drizzle-kit migrate
 *   TEST_DATABASE_URL=postgres://localhost:5432/bahaos_concurrency_test npm run test:db
 */
describe("createAppointment — concurrency-safe booking (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();
  let fixtures: Fixtures;

  beforeAll(async () => {
    await resetTestData(db);
  });

  beforeEach(async () => {
    await resetTestData(db);
    fixtures = await seedFixtures(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  function slot(startIso: string, endIso: string) {
    return { startsAt: new Date(startIso), endsAt: new Date(endIso) };
  }

  it("the race: two DIFFERENT customers requesting the exact same slot concurrently — exactly one succeeds, one conflicts, exactly one row exists", async () => {
    const time = slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z");

    const [resultA, resultB] = await Promise.all([
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...time,
      }),
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerBId, // a DIFFERENT customer — genuine competition, not a retry
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId, // SAME provider, SAME slot
        ...time,
      }),
    ]);

    const outcomes = [resultA, resultB];
    const successes = outcomes.filter((r) => r.success);
    const conflicts = outcomes.filter((r) => !r.success);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ success: false, reason: "conflict" });

    const rows = await db.query.appointments.findMany({
      where: eq(appointments.tenantId, fixtures.tenantId),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("booked");
  });

  it("different slots (2pm vs 3pm), same provider, concurrent — both succeed", async () => {
    const [resultA, resultB] = await Promise.all([
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z"),
      }),
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerBId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T15:00:00Z", "2026-09-01T15:30:00Z"),
      }),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    const rows = await db.query.appointments.findMany({
      where: eq(appointments.tenantId, fixtures.tenantId),
    });
    expect(rows).toHaveLength(2);
  });

  it("different providers, same slot, concurrent — both succeed (business rule: different staff can hold the same time)", async () => {
    const time = slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z");

    const [resultA, resultB] = await Promise.all([
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...time,
      }),
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerBId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffBId, // DIFFERENT provider
        ...time,
      }),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    const rows = await db.query.appointments.findMany({
      where: eq(appointments.tenantId, fixtures.tenantId),
    });
    expect(rows).toHaveLength(2);
  });

  it("a cancelled appointment does not block the slot for a new booking", async () => {
    const time = slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z");

    const [existingCancelled] = await db
      .insert(appointments)
      .values({
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        status: "cancelled",
        ...time,
      })
      .returning();
    expect(existingCancelled.status).toBe("cancelled");

    const result = await createAppointment(db, {
      tenantId: fixtures.tenantId,
      customerId: fixtures.customerBId,
      serviceId: fixtures.serviceId,
      staffUserId: fixtures.staffAId,
      ...time,
    });

    expect(result.success).toBe(true);

    const rows = await db.query.appointments.findMany({
      where: eq(appointments.tenantId, fixtures.tenantId),
    });
    expect(rows).toHaveLength(2); // the cancelled row + the new booked one
    expect(rows.filter((r) => r.status === "booked")).toHaveLength(1);
  });

  it("overlapping durations (2:00-2:30 vs 2:15-2:45), same provider, concurrent — one succeeds, one conflicts", async () => {
    const [resultA, resultB] = await Promise.all([
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z"),
      }),
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerBId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T14:15:00Z", "2026-09-01T14:45:00Z"), // overlaps 14:00-14:30 at 14:15-14:30
      }),
    ]);

    const outcomes = [resultA, resultB];
    expect(outcomes.filter((r) => r.success)).toHaveLength(1);
    expect(outcomes.filter((r) => !r.success)).toHaveLength(1);

    const rows = await db.query.appointments.findMany({
      where: eq(appointments.tenantId, fixtures.tenantId),
    });
    expect(rows).toHaveLength(1);
  });

  it("back-to-back appointments (2:00-2:30 immediately followed by 2:30-3:00) do NOT conflict", async () => {
    const [resultA, resultB] = await Promise.all([
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z"),
      }),
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerBId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T14:30:00Z", "2026-09-01T15:00:00Z"), // starts exactly when the first ends
      }),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
  });

  it("no staff assigned (null staffUserId): two DIFFERENT customers for the same tenant/slot still conflict — NULL is treated as one shared resource, not as distinct from itself", async () => {
    const time = slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z");

    const [resultA, resultB] = await Promise.all([
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: null,
        ...time,
      }),
      createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerBId,
        serviceId: fixtures.serviceId,
        staffUserId: null,
        ...time,
      }),
    ]);

    const outcomes = [resultA, resultB];
    expect(outcomes.filter((r) => r.success)).toHaveLength(1);
    expect(outcomes.filter((r) => !r.success)).toHaveLength(1);
  });

  describe("idempotency — the SAME customer/request retried must not create a second appointment", () => {
    it("a sequential retry of the identical request resolves to the same row, not a conflict", async () => {
      const request = {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z"),
      };

      const first = await createAppointment(db, request);
      const retry = await createAppointment(db, request);

      expect(first.success).toBe(true);
      expect(retry.success).toBe(true);
      if (first.success && retry.success) {
        expect(first.idempotentReplay).toBe(false);
        expect(retry.idempotentReplay).toBe(true);
        expect(retry.appointment.id).toBe(first.appointment.id);
      }

      const rows = await db.query.appointments.findMany({
        where: eq(appointments.tenantId, fixtures.tenantId),
      });
      expect(rows).toHaveLength(1);
    });

    it("a CONCURRENT retry of the identical request (e.g. a duplicate webhook delivery) still resolves to exactly one row, with no conflict reported", async () => {
      // Deliberately the SAME customerId/slot in both calls — this is
      // the "duplicate delivery" case, not two different customers
      // competing (that's the race test above, which correctly DOES
      // report a conflict).
      const request = {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z"),
      };

      const [resultA, resultB] = await Promise.all([
        createAppointment(db, request),
        createAppointment(db, request),
      ]);

      // Neither call should ever report a conflict for a true duplicate
      // of the SAME request — that would incorrectly tell a legitimate
      // customer their own request failed.
      expect(resultA.success).toBe(true);
      expect(resultB.success).toBe(true);

      const rows = await db.query.appointments.findMany({
        where: eq(appointments.tenantId, fixtures.tenantId),
      });
      expect(rows).toHaveLength(1);
    });

    it("two DIFFERENT customers are never confused with an idempotent retry, even for the identical slot", async () => {
      const time = slot("2026-09-01T14:00:00Z", "2026-09-01T14:30:00Z");

      const resultA = await createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerAId,
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...time,
      });
      const resultB = await createAppointment(db, {
        tenantId: fixtures.tenantId,
        customerId: fixtures.customerBId, // different customer, same everything else
        serviceId: fixtures.serviceId,
        staffUserId: fixtures.staffAId,
        ...time,
      });

      expect(resultA.success).toBe(true);
      expect(resultB).toMatchObject({ success: false, reason: "conflict" });
    });
  });
});
