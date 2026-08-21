import { isWithinOperatingWindow, validateAppointmentTime } from "../ai/business-hours";
import type {
  BusinessContext,
  ReceptionistTools,
  RequestAppointmentPayload,
  ToolResult,
} from "../ai/types";
import type { CalendarClient } from "./calendar/calendar-client";
import { toCalendarRange } from "./calendar/calendar-datetime";
import {
  createInMemoryAppointmentStore,
  createInMemoryReconciliationQueue,
  type InternalAppointmentStore,
  type ReconciliationQueue,
} from "./calendar/internal-appointment-store";
import { SlotLock } from "./calendar/slot-lock";

/**
 * Real-calendar-backed ReceptionistTools. Booking order, exactly as
 * specified:
 *   1. Business hours / service duration (fast local gate — no Google
 *      call for an obviously invalid request).
 *   2. Google Calendar availability (freebusy) — the source of truth for
 *      whether the slot is actually taken.
 *   3. Create the Google Calendar event.
 *   4. Create the internal appointment record.
 *   5. Report success.
 *
 * The customer only ever hears "success" once step 3 (the real calendar
 * event) has actually happened — see requestAppointment for exactly how
 * each failure mode after that point is handled without ever claiming a
 * real appointment failed when it didn't, or claiming one succeeded when
 * it didn't.
 *
 * requestReschedule/requestCancellation apply the same local
 * business-hours gate as createSimulatedReceptionistTools but do not yet
 * touch a specific existing Google Calendar event — RequestReschedule/
 * CancellationPayload carry no appointment/event reference (name+phone
 * only), so there is nothing to look up. This is a known, documented
 * limitation, not a silent gap — see the project report.
 */
export function createGoogleCalendarReceptionistTools(
  business: BusinessContext,
  calendarClient: CalendarClient,
  deps: {
    store?: InternalAppointmentStore;
    reconciliationQueue?: ReconciliationQueue;
    slotLock?: SlotLock;
  } = {},
): ReceptionistTools {
  const store = deps.store ?? createInMemoryAppointmentStore();
  const reconciliationQueue = deps.reconciliationQueue ?? createInMemoryReconciliationQueue();
  const slotLock = deps.slotLock ?? new SlotLock();

  return {
    async createLead(payload) {
      console.log("[google-calendar tool] create_lead", payload);
      return { success: true };
    },

    async requestAppointment(payload: RequestAppointmentPayload): Promise<ToolResult> {
      const service = business.services.find((s) => s.name === payload.service);
      if (!service) {
        return { success: false, error: `Unknown service: "${payload.service}".` };
      }

      // 1. Business hours / duration — fast local gate, no Google call.
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

      const idempotencyKey = buildIdempotencyKey(payload);

      // Idempotent retry of an already-completed request: never create a
      // second calendar event for the same booking.
      const existing = await store.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        console.log("[google-calendar tool] idempotent replay — already booked", idempotencyKey);
        return { success: true };
      }

      const range = toCalendarRange(
        payload.preferredDate,
        payload.preferredTime,
        service.durationMinutes,
      );
      const slotKey = `${payload.preferredDate}|${payload.preferredTime}`;

      // In-process guard: two concurrent requests for the SAME slot are
      // serialized, not run truly concurrently. Not distributed locking —
      // out of scope for this single-tenant demo — but enough that this
      // application never intentionally double-books a slot itself.
      return slotLock.withLock(slotKey, () =>
        bookWithinLock(
          business,
          calendarClient,
          store,
          reconciliationQueue,
          payload,
          range,
          idempotencyKey,
        ),
      );
    },

    async requestReschedule(payload) {
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
      // No existing-event reference is threaded through the conversation
      // yet (RequestReschedulePayload carries no appointment/event id),
      // so there is no specific Google Calendar event to move here —
      // documented limitation, not silently swallowed.
      console.log(
        "[google-calendar tool] request_reschedule (no linked calendar event to move yet)",
        payload,
      );
      return { success: true };
    },

    async requestCancellation(payload) {
      // Same limitation as reschedule: no event reference to cancel.
      console.log(
        "[google-calendar tool] request_cancellation (no linked calendar event to cancel yet)",
        payload,
      );
      return { success: true };
    },

    async escalate(payload) {
      console.log("[google-calendar tool] escalate", payload);
      return { success: true };
    },
  };
}

function buildIdempotencyKey(payload: RequestAppointmentPayload): string {
  return [payload.service, payload.preferredDate, payload.preferredTime, payload.phone]
    .join("|")
    .toLowerCase();
}

async function bookWithinLock(
  business: BusinessContext,
  calendarClient: CalendarClient,
  store: InternalAppointmentStore,
  reconciliationQueue: ReconciliationQueue,
  payload: RequestAppointmentPayload,
  range: { startDateTime: string; endDateTime: string },
  idempotencyKey: string,
): Promise<ToolResult> {
  // Re-check inside the lock: another call for this exact request may
  // have completed while we were waiting for the lock.
  const existingInsideLock = await store.findByIdempotencyKey(idempotencyKey);
  if (existingInsideLock) {
    return { success: true };
  }

  // 2. Google Calendar availability — the source of truth.
  let busyTimes;
  try {
    busyTimes = await calendarClient.listBusyTimes(
      range.startDateTime,
      range.endDateTime,
      business.timezone,
    );
  } catch (error) {
    console.error("[google-calendar tool] availability check failed", payload, error);
    return { success: false, error: "Could not reach the calendar system to check availability." };
  }
  if (busyTimes.length > 0) {
    return { success: false, error: "Requested time is no longer available." };
  }

  // 3. Create the Google Calendar event. The customer is only ever told
  // "success" once this has actually happened.
  let event;
  try {
    event = await calendarClient.createEvent({
      summary: `${payload.service} — ${payload.name}`,
      description: `Phone: ${payload.phone}`,
      startDateTime: range.startDateTime,
      endDateTime: range.endDateTime,
      timeZone: business.timezone,
    });
  } catch (error) {
    console.error("[google-calendar tool] event creation failed", payload, error);
    return { success: false, error: "Could not create the calendar event." };
  }

  // 4. Internal appointment record.
  const record = {
    idempotencyKey,
    googleEventId: event.id,
    name: payload.name,
    phone: payload.phone,
    service: payload.service,
    startDateTime: range.startDateTime,
    endDateTime: range.endDateTime,
    createdAt: new Date().toISOString(),
  };
  try {
    await store.save(record);
  } catch (error) {
    // The calendar event is real — the appointment exists. Never report
    // failure here; queue for reconciliation instead so the internal
    // record can be written later without touching Google Calendar again.
    console.error(
      "[google-calendar tool] internal record write failed after calendar success — queued for reconciliation",
      record,
      error,
    );
    await reconciliationQueue.enqueue({
      ...record,
      reason: error instanceof Error ? error.message : "unknown internal write failure",
      queuedAt: new Date().toISOString(),
    });
    return { success: true };
  }

  // 5. Success.
  return { success: true };
}
