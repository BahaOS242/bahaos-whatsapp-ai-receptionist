import type { ClinicSimulator } from "../simulator/clinic-simulator";
import type { SimulatedBooking } from "../simulator/simulation-state";
import type {
  CreateLeadPayload,
  EscalatePayload,
  ReceptionistTools,
  RequestAppointmentPayload,
  RequestCancellationPayload,
  RequestRecurringAppointmentPayload,
  RequestReschedulePayload,
  ToolResult,
} from "../ai/types";

/**
 * The clinic-simulator-backed ReceptionistTools implementation — Section
 * 1/4's actual wiring into the live conversational path. Satisfies the
 * SAME ReceptionistTools interface as the simulated/database/Google
 * Calendar implementations, so ReceptionistAgent/LLMProvider never
 * change to use this. Every availability/conflict decision comes from
 * `ClinicSimulator` (reference calendar + simulation transactions) —
 * never guessed, never re-derived from BusinessContext.unavailableSlots
 * (the older, simpler in-memory mechanism the plain simulated tools
 * use), which this implementation does not consult at all.
 *
 * `requestReschedule`/`requestCancellation` carry only name+phone (no
 * appointment reference — RequestReschedulePayload/
 * RequestCancellationPayload's own documented, pre-existing limitation,
 * shared with the DB-backed tools). This implementation resolves the
 * customer's SINGLE soonest upcoming simulated booking (by phone) and
 * acts on that.
 */
export function createClinicSimulatorReceptionistTools(simulator: ClinicSimulator): ReceptionistTools {
  function findSoonestBookingForPhone(phone: string): SimulatedBooking | undefined {
    const candidates = simulator.state
      .listActiveBookings()
      .filter((b) => b.customerPhone === phone)
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
    return candidates[0];
  }

  return {
    async createLead(payload: CreateLeadPayload): Promise<ToolResult> {
      console.log("[clinic simulator tool] create_lead", payload);
      return { success: true };
    },

    async requestAppointment(payload: RequestAppointmentPayload): Promise<ToolResult> {
      const service = simulator.calendar.services.find((s) => s.name === payload.service);
      if (!service) {
        return { success: false, error: `Unknown service: "${payload.service}".` };
      }

      const check = simulator.checkBookable(payload.preferredDate, payload.preferredTime, service.durationMinutes);
      if (!check.ok) {
        if (check.reason === "closed_day" || check.reason === "outside_hours") {
          console.error("[clinic simulator tool] request_appointment REJECTED (business hours)", payload, check);
          return {
            success: false,
            error: `Requested time is outside business hours (${check.reason}).`,
          };
        }
        if (check.reason === "out_of_range") {
          console.error("[clinic simulator tool] request_appointment REJECTED (out of range)", payload);
          return { success: false, error: "Requested date is beyond what the calendar currently covers." };
        }
        // Genuine calendar conflict — never claim it was booked. Provide
        // real alternatives from the simulator itself, spanning forward
        // from the requested slot (possibly onto a later day).
        console.error("[clinic simulator tool] request_appointment REJECTED (conflict)", payload);
        const alternatives = simulator.findNextAvailable(
          payload.preferredDate,
          payload.preferredTime,
          service.durationMinutes,
          3,
        );
        return {
          success: false,
          error: "Requested time is no longer available.",
          recoverable: {
            reason: "slot_conflict",
            alternativeTimes: alternatives
              .filter((a) => a.date === payload.preferredDate)
              .map((a) => a.time),
            alternativeSlots: alternatives,
          },
        };
      }

      const result = simulator.book(
        payload.preferredDate,
        payload.preferredTime,
        service.id,
        service.durationMinutes,
        payload.name,
        payload.phone,
      );
      if (!result.ok) {
        // checkBookable and book both re-derive the same conditions from
        // the same simulation state with nothing mutating in between, so
        // this is unreachable in practice — kept as an honest failure
        // rather than a silent success if that invariant is ever broken.
        return { success: false, error: "Could not book the requested slot." };
      }
      console.log("[clinic simulator tool] request_appointment", payload, "-> booking", result.booking.id);
      return { success: true, persisted: true };
    },

    async requestReschedule(payload: RequestReschedulePayload): Promise<ToolResult> {
      const existing = findSoonestBookingForPhone(payload.phone);
      if (!existing) {
        return {
          success: false,
          error: "No existing upcoming appointment found for this customer to reschedule.",
        };
      }

      const check = simulator.checkBookable(
        payload.newPreferredDate,
        payload.newPreferredTime,
        existing.durationMinutes,
      );
      if (!check.ok) {
        if (check.reason === "closed_day" || check.reason === "outside_hours") {
          console.error("[clinic simulator tool] request_reschedule REJECTED (business hours)", payload, check);
          return {
            success: false,
            error: `Requested time is outside business hours (${check.reason}).`,
          };
        }
        if (check.reason === "out_of_range") {
          return { success: false, error: "Requested date is beyond what the calendar currently covers." };
        }
        console.error("[clinic simulator tool] request_reschedule REJECTED (conflict)", payload);
        const alternatives = simulator.findNextAvailable(
          payload.newPreferredDate,
          payload.newPreferredTime,
          existing.durationMinutes,
          3,
        );
        return {
          success: false,
          error: "Requested new time is no longer available.",
          recoverable: {
            reason: "slot_conflict",
            alternativeTimes: alternatives
              .filter((a) => a.date === payload.newPreferredDate)
              .map((a) => a.time),
            alternativeSlots: alternatives,
          },
        };
      }

      const result = simulator.reschedule(
        existing.id,
        payload.newPreferredDate,
        payload.newPreferredTime,
        existing.durationMinutes,
      );
      if (!result.ok) {
        return { success: false, error: "Requested new time is no longer available." };
      }
      console.log("[clinic simulator tool] request_reschedule", payload, "-> booking", result.booking.id);
      return { success: true, persisted: true };
    },

    async requestCancellation(payload: RequestCancellationPayload): Promise<ToolResult> {
      const existing = findSoonestBookingForPhone(payload.phone);
      if (!existing) {
        return {
          success: false,
          error: "No existing upcoming appointment found for this customer to cancel.",
        };
      }
      const result = simulator.cancel(existing.id);
      if (!result.ok) {
        return { success: false, error: "Could not cancel the appointment." };
      }
      console.log("[clinic simulator tool] request_cancellation", payload, "-> booking", existing.id);
      return { success: true, persisted: true };
    },

    async requestRecurringAppointment(payload: RequestRecurringAppointmentPayload): Promise<ToolResult> {
      const service = simulator.calendar.services.find((s) => s.name === payload.service);
      if (!service) {
        return { success: false, error: `Unknown service: "${payload.service}".` };
      }

      // Defense-in-depth: every occurrence was already checked before
      // this action was ever proposed (see buildRecurringAutoConfirmToolCall
      // in llm-provider.ts / the analogous DevRuleBasedAIProvider path)
      // — no AIProvider decision is trusted to still hold true by the
      // time execution actually reaches here, same principle as every
      // other tool in this codebase. Books ALL-OR-NOTHING: if any
      // occurrence turns out to no longer be available (a genuine race
      // within this same simulated session — e.g. a correction reusing
      // a stale occurrence list), nothing already booked in this series
      // is left dangling; every occurrence booked so far in this call is
      // rolled back rather than silently leaving an incomplete series
      // (Section 6: "Never silently create an incomplete series").
      const booked: string[] = [];
      for (const date of payload.occurrenceDates) {
        const result = simulator.book(date, payload.startTime, service.id, service.durationMinutes, payload.name, payload.phone);
        if (!result.ok) {
          for (const bookingId of booked) simulator.cancel(bookingId);
          console.error(
            "[clinic simulator tool] request_recurring_appointment REJECTED (occurrence conflict during booking) — rolled back",
            payload,
            { failedDate: date, reason: result.reason },
          );
          return {
            success: false,
            error: `The ${date} occurrence is no longer available — nothing in this series was booked.`,
          };
        }
        booked.push(result.booking.id);
      }

      console.log(
        "[clinic simulator tool] request_recurring_appointment",
        payload,
        "-> bookings",
        booked,
      );
      return { success: true, persisted: true };
    },

    async escalate(payload: EscalatePayload): Promise<ToolResult> {
      console.log("[clinic simulator tool] escalate", payload);
      return { success: true };
    },
  };
}
