import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDatabaseReceptionistTools } from "../../src/tools/database-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { appointments, services } from "../../src/db/schema";
import { findOrCreateActiveConversation } from "../../src/db/conversations";
import { resolveCustomer, resolveTenant } from "../../src/db/domain-resolution";
import { resolveAppointmentTimestamp } from "../../src/ai/appointment-timestamp";
import { createTestDb, resetTestData } from "./db-test-helpers";

/**
 * Dedicated coverage for createDatabaseReceptionistTools
 * (src/tools/database-receptionist-tools.ts) itself — the booking/
 * reschedule/cancellation success and failure paths, including the
 * documented "soonest upcoming appointment" limitation. Previously this
 * file was only exercised indirectly via
 * production-path-concurrency.test.ts's two race tests, which never
 * covered reschedule, cancellation, or the various failure paths.
 *
 * REQUIRES a real Postgres — see appointments-concurrency.test.ts's
 * header for setup. Run via `npm run test:db`.
 */
describe("createDatabaseReceptionistTools (REQUIRES a real Postgres — see file header)", () => {
  const { db, pool } = createTestDb();
  const tools = createDatabaseReceptionistTools(BAHAMAS_DENTAL_SERVICE, db);

  beforeEach(async () => {
    await resetTestData(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function bookedRows() {
    return db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
  }

  describe("requestAppointment", () => {
    it("creates a real appointment row for a valid service/time and can be found afterward", async () => {
      const result = await tools.requestAppointment({
        name: "Trevor",
        phone: "2428012847",
        service: "Routine cleaning",
        preferredDate: "Monday",
        preferredTime: "10:00",
      });

      expect(result).toEqual({ success: true, persisted: true });

      const rows = await bookedRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("booked");
      // 60-minute service (see BAHAMAS_DENTAL_SERVICE.services).
      const durationMs = rows[0].endsAt.getTime() - rows[0].startsAt.getTime();
      expect(durationMs).toBe(60 * 60_000);
    });

    it("rejects an unknown service without touching the database", async () => {
      const result = await tools.requestAppointment({
        name: "Trevor",
        phone: "2428012847",
        service: "Nonexistent service",
        preferredDate: "Monday",
        preferredTime: "10:00",
      });

      expect(result.success).toBe(false);
      const rows = await db.query.appointments.findMany();
      expect(rows).toHaveLength(0);
    });

    it("rejects a time outside business hours (defense-in-depth re-validation) without touching the database", async () => {
      const result = await tools.requestAppointment({
        name: "Trevor",
        phone: "2428012847",
        service: "Routine cleaning",
        preferredDate: "Sunday", // BAHAMAS_DENTAL_SERVICE.weeklyHours.Sunday === null
        preferredTime: "10:00",
      });

      expect(result.success).toBe(false);
      const rows = await db.query.appointments.findMany();
      expect(rows).toHaveLength(0);
    });

    it("a genuine slot conflict returns a recoverable result with real DB-backed alternatives, and creates no duplicate row", async () => {
      const first = await tools.requestAppointment({
        name: "Trevor",
        phone: "2428012847",
        service: "Routine cleaning",
        preferredDate: "Monday",
        preferredTime: "10:00",
      });
      expect(first.success).toBe(true);

      const second = await tools.requestAppointment({
        name: "Sarah",
        phone: "2428019999",
        service: "Routine cleaning",
        preferredDate: "Monday",
        preferredTime: "10:00",
      });

      expect(second.success).toBe(false);
      expect(second.recoverable?.reason).toBe("slot_conflict");
      expect(second.recoverable?.alternativeTimes.length).toBeGreaterThan(0);
      expect(second.recoverable?.alternativeTimes).not.toContain("10:00");

      const rows = await db.query.appointments.findMany({ where: eq(appointments.status, "booked") });
      expect(rows).toHaveLength(1);
    });
  });

  describe("requestReschedule", () => {
    async function book(name: string, phone: string, time: string) {
      const result = await tools.requestAppointment({
        name,
        phone,
        service: "Routine cleaning",
        preferredDate: "Monday",
        preferredTime: time,
      });
      expect(result.success).toBe(true);
    }

    it("moves the customer's appointment to the new time: old cancelled, new booked", async () => {
      await book("Trevor", "2428012847", "10:00");

      const result = await tools.requestReschedule({
        name: "Trevor",
        phone: "2428012847",
        newPreferredDate: "Tuesday",
        newPreferredTime: "11:00",
      });

      expect(result).toEqual({ success: true, persisted: true });

      const all = await db.query.appointments.findMany();
      const cancelled = all.filter((a) => a.status === "cancelled");
      const booked = all.filter((a) => a.status === "booked");
      expect(cancelled).toHaveLength(1);
      expect(booked).toHaveLength(1);
      expect(cancelled[0].cancellationReason).toMatch(/reschedul/i);
      // The new appointment preserves the original 60-minute duration.
      const durationMs = booked[0].endsAt.getTime() - booked[0].startsAt.getTime();
      expect(durationMs).toBe(60 * 60_000);
    });

    it("fails clearly when the customer has no upcoming appointment to reschedule, and creates nothing", async () => {
      const result = await tools.requestReschedule({
        name: "Trevor",
        phone: "2428012847",
        newPreferredDate: "Tuesday",
        newPreferredTime: "11:00",
      });

      expect(result.success).toBe(false);
      const rows = await db.query.appointments.findMany();
      expect(rows).toHaveLength(0);
    });

    it("if the new slot is already taken, the existing appointment is left untouched (never destroyed by a failed reschedule)", async () => {
      await book("Trevor", "2428012847", "10:00");
      await book("Sarah", "2428019999", "11:00"); // occupies the slot Trevor will try to move into

      const result = await tools.requestReschedule({
        name: "Trevor",
        phone: "2428012847",
        newPreferredDate: "Monday",
        newPreferredTime: "11:00",
      });

      expect(result.success).toBe(false);
      expect(result.recoverable?.reason).toBe("slot_conflict");

      // Trevor's ORIGINAL appointment must still be booked — a failed
      // reschedule must never cost the customer their existing slot.
      const stillBooked = await db.query.appointments.findMany({
        where: eq(appointments.status, "booked"),
      });
      expect(stillBooked).toHaveLength(2); // Trevor's original + Sarah's
    });

    it("with multiple upcoming appointments, picks the soonest (documented limitation)", async () => {
      await book("Trevor", "2428012847", "10:00"); // Monday 10:00
      const laterResult = await tools.requestAppointment({
        name: "Trevor",
        phone: "2428012847",
        service: "Basic filling",
        preferredDate: "Tuesday",
        preferredTime: "10:00",
      });
      expect(laterResult.success).toBe(true);

      // Which of "Monday 10:00" / "Tuesday 10:00" actually resolves to
      // the SOONER real timestamp depends on what day "today" happens to
      // be when this test runs — e.g. if today IS Monday and it's
      // already past 10:00, "Monday 10:00" rolls a full week forward and
      // is actually LATER than tomorrow's Tuesday. Computed the same way
      // the tool itself resolves it, rather than assumed, so this test
      // is correct on every day of the week, not just the day it was
      // written on.
      const mondayStartsAt = resolveAppointmentTimestamp({
        business: BAHAMAS_DENTAL_SERVICE,
        weekday: "Monday",
        time: "10:00",
      });
      const tuesdayStartsAt = resolveAppointmentTimestamp({
        business: BAHAMAS_DENTAL_SERVICE,
        weekday: "Tuesday",
        time: "10:00",
      });
      if (!mondayStartsAt.ok || !tuesdayStartsAt.ok) {
        throw new Error("resolveAppointmentTimestamp unexpectedly failed for a fixed weekday/time");
      }
      const soonestServiceName =
        mondayStartsAt.startsAt.getTime() < tuesdayStartsAt.startsAt.getTime()
          ? "Routine cleaning"
          : "Basic filling";

      const result = await tools.requestReschedule({
        name: "Trevor",
        phone: "2428012847",
        newPreferredDate: "Wednesday",
        newPreferredTime: "10:00",
      });
      expect(result.success).toBe(true);

      const all = await db.query.appointments.findMany();
      const cancelled = all.find((a) => a.status === "cancelled");
      expect(cancelled).toBeDefined();

      const soonestService = await db.query.services.findFirst({
        where: eq(services.name, soonestServiceName),
      });
      // The chronologically soonest appointment was the one rescheduled
      // — the other, later one is left untouched.
      expect(cancelled!.serviceId).toBe(soonestService!.id);

      const stillBooked = all.filter((a) => a.status === "booked");
      expect(stillBooked).toHaveLength(2); // the later original + the new Wednesday slot
      expect(stillBooked.some((a) => a.serviceId !== soonestService!.id)).toBe(true);
    });
  });

  describe("requestCancellation", () => {
    it("cancels the customer's upcoming appointment with the given reason", async () => {
      await tools.requestAppointment({
        name: "Trevor",
        phone: "2428012847",
        service: "Routine cleaning",
        preferredDate: "Monday",
        preferredTime: "10:00",
      });

      const result = await tools.requestCancellation({
        name: "Trevor",
        phone: "2428012847",
        reason: "Change of plans",
      });

      expect(result).toEqual({ success: true, persisted: true });
      const rows = await db.query.appointments.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("cancelled");
      expect(rows[0].cancellationReason).toBe("Change of plans");
    });

    it("fails clearly when there is no upcoming appointment to cancel", async () => {
      const result = await tools.requestCancellation({
        name: "Trevor",
        phone: "2428012847",
        reason: "Change of plans",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("createLead — real persistence (Objective 1)", () => {
    it("creates a real, traceable lead row when conversationId is present", async () => {
      const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
      const customerId = await resolveCustomer(db, tenantId, "+12428012847", "Trevor");
      const conversation = await findOrCreateActiveConversation(db, tenantId, customerId);

      const result = await tools.createLead({
        name: "Trevor",
        phone: "2428012847",
        serviceInterest: "Root canal",
        conversationId: conversation.id,
      });

      expect(result).toEqual({ success: true });
      const rows = await db.query.leads.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].sourceConversationId).toBe(conversation.id);
      expect(rows[0].serviceInterest).toBe("Root canal");
      expect(rows[0].tenantId).toBe(tenantId);
    });

    it("falls back to log-only (no row, still success) when conversationId is absent", async () => {
      const result = await tools.createLead({ name: "Trevor", phone: "2428012847" });

      expect(result).toEqual({ success: true });
      const rows = await db.query.leads.findMany();
      expect(rows).toHaveLength(0);
    });

    it("falls back to log-only when phone is absent, even with a conversationId", async () => {
      const result = await tools.createLead({ name: "Trevor", conversationId: "00000000-0000-0000-0000-000000000000" });

      expect(result).toEqual({ success: true });
      const rows = await db.query.leads.findMany();
      expect(rows).toHaveLength(0);
    });
  });

  describe("escalate — real persistence (Objective 1/7)", () => {
    it("creates a real, traceable handoff row with a bookingState context snapshot when conversationId is present", async () => {
      const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
      const customerId = await resolveCustomer(db, tenantId, "+12428012847", "Trevor");
      const conversation = await findOrCreateActiveConversation(db, tenantId, customerId);

      const result = await tools.escalate({
        reason: "customer explicitly asked for a person",
        conversationId: conversation.id,
        bookingStateSnapshot: { intent: "book_appointment", service: "Routine cleaning" },
      });

      expect(result).toEqual({ success: true });
      const rows = await db.query.handoffs.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].conversationId).toBe(conversation.id);
      expect(rows[0].tenantId).toBe(tenantId);
      expect(rows[0].reason).toBe("customer explicitly asked for a person");
      expect(rows[0].status).toBe("open");
      expect(rows[0].context).toEqual({
        bookingState: { intent: "book_appointment", service: "Routine cleaning" },
      });
    });

    it("falls back to log-only (no row, still success) when conversationId is absent", async () => {
      const result = await tools.escalate({ reason: "customer explicitly asked for a person" });

      expect(result).toEqual({ success: true });
      const rows = await db.query.handoffs.findMany();
      expect(rows).toHaveLength(0);
    });
  });
});
