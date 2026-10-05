import { and, eq, gte } from "drizzle-orm";
import { validateAppointmentTime, isWithinOperatingWindow } from "../ai/business-hours";
import { addMinutes, resolveAppointmentTimestamp } from "../ai/appointment-timestamp";
import { isIsoDateString } from "../ai/date-time";
import { extractPhone } from "../ai/phone";
import { createAppointment } from "../db/appointments";
import { findDbAlternativeTimes } from "../db/appointment-availability";
import { resolveCustomer, resolveService, resolveTenant } from "../db/domain-resolution";
import { createHandoff } from "../db/handoffs";
import { createLeadRecord } from "../db/leads";
import { appointments } from "../db/schema";
import type { Db } from "../db/client";
import type {
  BusinessContext,
  CreateLeadPayload,
  EscalatePayload,
  ReceptionistTools,
  RequestAppointmentPayload,
  RequestCancellationPayload,
  RequestRecurringAppointmentPayload,
  RequestReschedulePayload,
  ToolResult,
  Weekday,
} from "../ai/types";

/**
 * The real, database-authoritative ReceptionistTools implementation —
 * wires the concurrency-safe booking layer (src/db/appointments.ts) into
 * the live ReceptionistAgent → ReceptionistTools boundary. Satisfies the
 * SAME ReceptionistTools interface as createSimulatedReceptionistTools
 * and createGoogleCalendarReceptionistTools, so ReceptionistAgent/
 * LLMProvider never change to use this.
 *
 * "Application availability check = conversational guidance. Database
 * booking transaction = truth" (see PHASE1_PROGRESS.md): LLMProvider's
 * existing in-memory hours/availability checks are UNCHANGED and still
 * run first, giving the natural "that time works" / "here are
 * alternatives" conversational flow. This tool then makes the ONE real
 * attempt — hours are re-validated here too (same defense-in-depth
 * principle already documented in the simulated tools: no AIProvider
 * decision is trusted to be correct), and the actual write is the single
 * atomic, exclusion-constraint-protected INSERT. A conflict here is
 * expected to be RARE (the in-memory check already filters out the
 * common case) but is still handled gracefully via `recoverable` (see
 * types.ts) rather than as a hard failure — see ReceptionistAgent's
 * slot-conflict branch.
 *
 * requestReschedule/requestCancellation carry only name+phone (no
 * appointment reference — see RequestReschedulePayload/
 * RequestCancellationPayload in types.ts, a pre-existing limitation
 * already documented for the Google Calendar tools). This implementation
 * resolves the customer's SINGLE soonest upcoming booked appointment and
 * acts on that. Documented, known limitation: if a customer has more
 * than one upcoming appointment, this picks the soonest rather than
 * asking which one — see PHASE1_PROGRESS.md.
 */


/** `date` is either a canonical weekday name or a real "YYYY-MM-DD" (see
 * date-time.ts's resolveCalendarDateWord) — resolveAppointmentTimestamp
 * needs to know which one it's holding. */
function resolveTimestampFor(business: BusinessContext, date: string, time: string, now: Date) {
  return resolveAppointmentTimestamp({
    business,
    ...(isIsoDateString(date) ? { isoDate: date } : { weekday: date as Weekday }),
    time,
    now,
  });
}

export function createDatabaseReceptionistTools(business: BusinessContext, db: Db): ReceptionistTools {
  return {
    async createLead(payload: CreateLeadPayload): Promise<ToolResult> {
      console.log("[database tool] create_lead", payload);
      // conversationId (stamped by ReceptionistAgent — see
      // CreateLeadPayload's docstring) is what makes a REAL, traceable
      // lead row possible; a phone is also required to resolve which
      // customer it belongs to. Either being absent falls back to the
      // log-only behavior every other ReceptionistTools implementation
      // already has — never a hard failure, since a lead is a soft
      // record, not a business-critical action.
      if (!payload.conversationId || !payload.phone) {
        return { success: true };
      }
      const tenantId = await resolveTenant(db, business);
      const normalizedPhone = extractPhone(payload.phone, business.areaCode) ?? payload.phone;
      const customerId = await resolveCustomer(db, tenantId, normalizedPhone, payload.name);
      await createLeadRecord(db, {
        tenantId,
        customerId,
        sourceConversationId: payload.conversationId,
        serviceInterest: payload.serviceInterest,
      });
      return { success: true };
    },

    async requestAppointment(payload: RequestAppointmentPayload): Promise<ToolResult> {
      const service = business.services.find((s) => s.name === payload.service);
      if (!service) {
        return { success: false, error: `Unknown service: "${payload.service}".` };
      }

      // Same defense-in-depth hours re-validation as the other two
      // ReceptionistTools implementations — never trust the caller.
      const hoursValidation = validateAppointmentTime(
        business,
        payload.preferredDate,
        payload.preferredTime,
        service.durationMinutes,
      );
      if (!hoursValidation.valid) {
        return {
          success: false,
          error: `Requested time is outside business hours (${hoursValidation.reason}).`,
        };
      }

      const now = new Date();
      const resolved = resolveTimestampFor(business, payload.preferredDate, payload.preferredTime, now);
      if (!resolved.ok) {
        return { success: false, error: `Could not resolve a real timestamp: ${resolved.reason}.` };
      }
      const startsAt = resolved.startsAt;
      const endsAt = addMinutes(startsAt, service.durationMinutes);

      const tenantId = await resolveTenant(db, business);
      const resolvedService = await resolveService(db, tenantId, business, payload.service);
      if (!resolvedService) {
        // Unreachable in practice (payload.service was already validated
        // against business.services above), but never silently proceed
        // with an unresolved FK.
        return { success: false, error: `Could not resolve service record for "${payload.service}".` };
      }
      // Same defense-in-depth phone normalization as requestReschedule/
      // requestCancellation below — never trust the caller's phone
      // formatting to already be canonical. The full production
      // conversation pipeline (llm-provider.ts) normalizes phone before
      // building this payload, but resolveCustomer's get-or-create is
      // keyed on the exact string, so any caller that skips that upstream
      // normalization would otherwise create a second, disconnected
      // customer record the next time the SAME person tries to reschedule
      // or cancel.
      const normalizedPhone = extractPhone(payload.phone, business.areaCode) ?? payload.phone;
      const customerId = await resolveCustomer(db, tenantId, normalizedPhone, payload.name);

      const result = await createAppointment(db, {
        tenantId,
        customerId,
        serviceId: resolvedService.serviceId,
        staffUserId: null, // no per-staff scheduling in this product yet
        startsAt,
        endsAt,
      });

      if (result.success) {
        return { success: true, persisted: true };
      }

      // A genuine race loss — the in-memory check said this looked fine,
      // but the database (the actual authority) says someone else's
      // booking already holds it. Recoverable, not a hard failure — see
      // ReceptionistAgent's handling of ToolResult.recoverable.
      const alternativeTimes = await findDbAlternativeTimes(
        db,
        tenantId,
        null,
        business,
        payload.preferredDate as Weekday,
        service.durationMinutes,
        payload.preferredTime,
        now,
      );
      return {
        success: false,
        error: "Requested time is no longer available (lost a booking race).",
        recoverable: { reason: "slot_conflict", alternativeTimes },
      };
    },

    async requestReschedule(payload: RequestReschedulePayload): Promise<ToolResult> {
      const validation = isWithinOperatingWindow(
        business,
        payload.newPreferredDate,
        payload.newPreferredTime,
      );
      if (!validation.valid) {
        return {
          success: false,
          error: `Requested time is outside business hours (${validation.reason}).`,
        };
      }

      const tenantId = await resolveTenant(db, business);
      const normalizedPhone = extractPhone(payload.phone, business.areaCode) ?? payload.phone;
      const customerId = await resolveCustomer(db, tenantId, normalizedPhone, payload.name);

      const existing = await findSoonestUpcomingAppointment(db, tenantId, customerId, new Date());
      if (!existing) {
        return {
          success: false,
          error: "No existing upcoming appointment found for this customer to reschedule.",
        };
      }

      const durationMinutes = Math.round(
        (existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000,
      );
      const now = new Date();
      const resolved = resolveTimestampFor(business, payload.newPreferredDate, payload.newPreferredTime, now);
      if (!resolved.ok) {
        return { success: false, error: `Could not resolve a real timestamp: ${resolved.reason}.` };
      }
      const newStartsAt = resolved.startsAt;
      const newEndsAt = addMinutes(newStartsAt, durationMinutes);

      // Reschedule = atomically create the new slot, then cancel the old
      // one — never the other way around, so a conflict on the NEW slot
      // never destroys the customer's still-valid existing appointment.
      const created = await createAppointment(db, {
        tenantId,
        customerId,
        serviceId: existing.serviceId,
        staffUserId: existing.staffUserId,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
      });
      if (!created.success) {
        const alternativeTimes = await findDbAlternativeTimes(
          db,
          tenantId,
          existing.staffUserId,
          business,
          payload.newPreferredDate as Weekday,
          durationMinutes,
          payload.newPreferredTime,
          now,
        );
        return {
          success: false,
          error: "Requested new time is no longer available (lost a booking race).",
          recoverable: { reason: "slot_conflict", alternativeTimes },
        };
      }

      await db
        .update(appointments)
        .set({ status: "cancelled", cancellationReason: "Rescheduled to a new time" })
        .where(eq(appointments.id, existing.id));

      return { success: true, persisted: true };
    },

    async requestCancellation(payload: RequestCancellationPayload): Promise<ToolResult> {
      const tenantId = await resolveTenant(db, business);
      const normalizedPhone = extractPhone(payload.phone, business.areaCode) ?? payload.phone;
      const customerId = await resolveCustomer(db, tenantId, normalizedPhone, payload.name);

      const existing = await findSoonestUpcomingAppointment(db, tenantId, customerId, new Date());
      if (!existing) {
        return {
          success: false,
          error: "No existing upcoming appointment found for this customer to cancel.",
        };
      }

      await db
        .update(appointments)
        .set({ status: "cancelled", cancellationReason: payload.reason ?? "Customer requested" })
        .where(eq(appointments.id, existing.id));

      return { success: true, persisted: true };
    },

    async requestRecurringAppointment(payload: RequestRecurringAppointmentPayload): Promise<ToolResult> {
      // Genuinely NOT implemented here — see ReceptionistTools.requestRecurringAppointment's
      // own docstring and Section 9's "do NOT fake it." The appointments
      // table has no concept of a recurring series; only the clinic
      // simulator's own in-memory bookings can genuinely represent one
      // this pass. Neither provider proposes this action against this
      // backend in practice (see AIProviderRequest.checkAvailability).
      console.error("[database tool] request_recurring_appointment REJECTED (not supported by this backend)", payload);
      return {
        success: false,
        error: "Recurring scheduling is not available on this backend.",
      };
    },

    async escalate(payload: EscalatePayload): Promise<ToolResult> {
      console.log("[database tool] escalate", payload);
      // conversationId (stamped by ReceptionistAgent — see
      // EscalatePayload's docstring) is what makes a real, traceable
      // handoff row possible. Absent for any caller not using durable
      // persistence — falls back to log-only, same as before.
      if (!payload.conversationId) {
        return { success: true };
      }
      const tenantId = await resolveTenant(db, business);
      await createHandoff(db, {
        tenantId,
        conversationId: payload.conversationId,
        reason: payload.reason,
        context: payload.bookingStateSnapshot
          ? {
              bookingState: payload.bookingStateSnapshot,
              unresolvedQuestion: payload.unresolvedQuestion,
            }
          : undefined,
      });
      return { success: true };
    },
  };
}

async function findSoonestUpcomingAppointment(
  db: Db,
  tenantId: string,
  customerId: string,
  now: Date,
): Promise<
  | { id: string; serviceId: string; staffUserId: string | null; startsAt: Date; endsAt: Date }
  | undefined
> {
  const candidates = await db.query.appointments.findMany({
    where: and(
      eq(appointments.tenantId, tenantId),
      eq(appointments.customerId, customerId),
      eq(appointments.status, "booked"),
      gte(appointments.startsAt, now),
    ),
    orderBy: (a, { asc }) => [asc(a.startsAt)],
    limit: 1,
  });
  return candidates[0];
}
