import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  approveObservation,
  confirmObservation,
  listObservationsForReview,
  normalizePhrase,
  recordObservation,
  rejectObservation,
} from "../../src/db/language-observations";
import { createDbLanguageObservationRecorder } from "../../src/ai/language-observation-recorder";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { appointments, customers, languageObservations, services, tenants } from "../../src/db/schema";
import { createTestDb, resetTestData } from "./db-test-helpers";

/**
 * Objectives 5/6 — the structured language/dialect observation
 * foundation. Covers the full OBSERVED -> CUSTOMER_CONFIRMED ->
 * REPEATED -> APPROVED state machine, phrase normalization/merging,
 * and — the actual safety requirement — that nothing here can
 * silently alter production behavior on its own.
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("Language observations — Objectives 5/6 (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();
  let tenantId: string;

  beforeEach(async () => {
    await resetTestData(db);
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: "lang-test", name: "Language Test Tenant", timezone: "UTC" })
      .returning();
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("normalizePhrase trims, collapses whitespace, and lowercases", () => {
    expect(normalizePhrase("  Put me   down fi  ")).toBe("put me down fi");
    expect(normalizePhrase("PUT ME DOWN FI")).toBe("put me down fi");
  });

  it("recording a new phrase creates an 'observed' row with observationCount 1", async () => {
    const result = await recordObservation(db, {
      tenantId,
      phrase: "put me down fi",
      normalizedMeaning: "book appointment",
      intent: "book_appointment",
    });

    expect(result.status).toBe("observed");
    expect(result.observationCount).toBe(1);
    expect(result.confirmationCount).toBe(0);
    expect(result.phrase).toBe("put me down fi");
    expect(result.language).toBe("en");
  });

  it("item 5 — reason/context/outcome are stored and returned for an unclear-phrase observation", async () => {
    const result = await recordObservation(db, {
      tenantId,
      phrase: "wah gwaan unnu",
      normalizedMeaning: "(no confident interpretation)",
      intent: "unknown",
      reason: 'no recognized field found while "service" was being asked for',
      context: "intent=book_appointment; nextRequiredField=service",
      outcome: "asked_for_clarification",
    });

    expect(result.reason).toBe('no recognized field found while "service" was being asked for');
    expect(result.context).toBe("intent=book_appointment; nextRequiredField=service");
    expect(result.outcome).toBe("asked_for_clarification");

    // Never the customer's full message beyond the flagged phrase itself
    // — the whole point of `context` being a short, structured snapshot,
    // not raw conversation text (see this table's own docstring).
    expect(result.context).not.toMatch(/\bi want\b|\bcan i\b/i);
  });

  it("item 5 — createDbLanguageObservationRecorder resolves the tenant and writes a real row end-to-end", async () => {
    const recorder = createDbLanguageObservationRecorder(BAHAMAS_DENTAL_SERVICE, db);

    await recorder.record({
      phrase: "mi need fi reach unnu",
      reason: "no recognized intent, service, or active flow matched this message",
      context: "intent=none",
      outcome: "asked_for_clarification",
    });

    const rows = await db.query.languageObservations.findMany({
      where: eq(languageObservations.phrase, "mi need fi reach unnu"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].normalizedMeaning).toBe("(no confident interpretation)");
    expect(rows[0].intent).toBe("unknown");
    expect(rows[0].reason).toBe("no recognized intent, service, or active flow matched this message");
    expect(rows[0].outcome).toBe("asked_for_clarification");
    // Resolved against the REAL tenant for this business, not a
    // throwaway/placeholder one — findOrCreate semantics, same as every
    // other domain-resolution.ts caller.
    const [tenant] = await db.query.tenants.findMany({ where: eq(tenants.slug, "bahamas-dental-service") });
    expect(rows[0].tenantId).toBe(tenant.id);
  });

  it("recording the SAME phrase again (different casing/whitespace) merges into the same row, incrementing observationCount", async () => {
    const first = await recordObservation(db, {
      tenantId,
      phrase: "put me down fi",
      normalizedMeaning: "book appointment",
      intent: "book_appointment",
    });
    const second = await recordObservation(db, {
      tenantId,
      phrase: "  Put Me Down Fi  ",
      normalizedMeaning: "book appointment",
      intent: "book_appointment",
    });

    expect(second.id).toBe(first.id);
    expect(second.observationCount).toBe(2);
  });

  it("the full state progression: observed -> customer_confirmed -> repeated -> approved", async () => {
    const observed = await recordObservation(db, {
      tenantId,
      phrase: "I gine need...",
      normalizedMeaning: "customer needs assistance",
      intent: "needs_assistance",
    });
    expect(observed.status).toBe("observed");

    const confirmed = await confirmObservation(db, observed.id);
    expect(confirmed.status).toBe("customer_confirmed");
    expect(confirmed.confirmationCount).toBe(1);

    // Seen again in a LATER, independent sighting — the mission's own
    // progression: confirmed once, then observed again, is "repeated".
    const repeated = await recordObservation(db, {
      tenantId,
      phrase: "I gine need...",
      normalizedMeaning: "customer needs assistance",
      intent: "needs_assistance",
    });
    expect(repeated.status).toBe("repeated");
    expect(repeated.observationCount).toBe(2);

    // Approval is EXCLUSIVELY a human/explicit action — nothing above
    // ever calls this on its own.
    const approved = await approveObservation(db, repeated.id);
    expect(approved.status).toBe("approved");
  });

  it("a second confirmation just increments the count — status doesn't regress or re-advance", async () => {
    const observed = await recordObservation(db, {
      tenantId,
      phrase: "put me down fi",
      normalizedMeaning: "book appointment",
      intent: "book_appointment",
    });
    await confirmObservation(db, observed.id);
    const secondConfirm = await confirmObservation(db, observed.id);

    expect(secondConfirm.status).toBe("customer_confirmed");
    expect(secondConfirm.confirmationCount).toBe(2);
  });

  it("rejectObservation can decline an observation from any non-terminal state", async () => {
    const observed = await recordObservation(db, {
      tenantId,
      phrase: "some ambiguous phrase",
      normalizedMeaning: "unclear",
      intent: "unknown",
    });

    const rejected = await rejectObservation(db, observed.id);
    expect(rejected.status).toBe("rejected");
  });

  it("the FIRST proposed meaning/intent for a phrase is preserved even if a later observation proposes something different", async () => {
    const first = await recordObservation(db, {
      tenantId,
      phrase: "book me",
      normalizedMeaning: "book appointment",
      intent: "book_appointment",
    });
    const second = await recordObservation(db, {
      tenantId,
      phrase: "book me",
      normalizedMeaning: "something else entirely",
      intent: "different_intent",
    });

    expect(second.id).toBe(first.id);
    expect(second.normalizedMeaning).toBe("book appointment");
    expect(second.intent).toBe("book_appointment");
  });

  it("listObservationsForReview excludes approved/rejected by default and orders by strongest evidence first", async () => {
    await recordObservation(db, {
      tenantId,
      phrase: "weak signal",
      normalizedMeaning: "maybe booking",
      intent: "book_appointment",
    });
    const strong = await recordObservation(db, {
      tenantId,
      phrase: "strong signal",
      normalizedMeaning: "definitely booking",
      intent: "book_appointment",
    });
    await confirmObservation(db, strong.id);
    await confirmObservation(db, strong.id);
    const approved = await recordObservation(db, {
      tenantId,
      phrase: "already approved",
      normalizedMeaning: "known good",
      intent: "book_appointment",
    });
    await approveObservation(db, approved.id);

    const forReview = await listObservationsForReview(db, tenantId);

    expect(forReview.map((o) => o.phrase)).toEqual(["strong signal", "weak signal"]);
    expect(forReview.some((o) => o.id === approved.id)).toBe(false);
  });

  it("SAFETY: recording and confirming observations never touches anything outside the language_observations table", async () => {
    // Concretely: seed a tenant/customer/service/appointment, record and
    // confirm several observations, and prove none of that other data
    // moved at all — the actual "must never silently alter production
    // behavior" requirement, made concrete rather than asserted by
    // architecture alone.
    const [service] = await db
      .insert(services)
      .values({ tenantId, name: "Routine cleaning", durationMinutes: 60 })
      .returning();
    const [customer] = await db
      .insert(customers)
      .values({ tenantId, whatsappId: "+12428012847" })
      .returning();
    const [appointment] = await db
      .insert(appointments)
      .values({
        tenantId,
        customerId: customer.id,
        serviceId: service.id,
        startsAt: new Date("2026-09-01T14:00:00Z"),
        endsAt: new Date("2026-09-01T15:00:00Z"),
      })
      .returning();

    const observed = await recordObservation(db, {
      tenantId,
      phrase: "put me down fi",
      normalizedMeaning: "book appointment",
      intent: "book_appointment",
    });
    await confirmObservation(db, observed.id);
    await recordObservation(db, {
      tenantId,
      phrase: "put me down fi",
      normalizedMeaning: "book appointment",
      intent: "book_appointment",
    });
    await approveObservation(db, observed.id);

    const serviceAfter = await db.query.services.findFirst({ where: eq(services.id, service.id) });
    const customerAfter = await db.query.customers.findFirst({ where: eq(customers.id, customer.id) });
    const appointmentAfter = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointment.id),
    });

    expect(serviceAfter).toEqual(service);
    expect(customerAfter).toEqual(customer);
    expect(appointmentAfter).toEqual(appointment);
  });
});
