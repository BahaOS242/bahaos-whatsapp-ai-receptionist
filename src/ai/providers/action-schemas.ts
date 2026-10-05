import { z } from "zod";

/**
 * Validates parsed tool-call arguments from the LLM before they're ever
 * trusted as a real ReceptionistAction. Also doubles as the source of
 * truth for each action's payload shape.
 */

export const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  serviceInterest: z.string().optional(),
});

export const requestAppointmentSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  service: z.string().min(1),
  preferredDate: z.string().min(1),
  preferredTime: z.string().min(1),
});

export const requestRescheduleSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  newPreferredDate: z.string().min(1),
  newPreferredTime: z.string().min(1),
});

export const requestCancellationSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  reason: z.string().optional(),
});

export const escalateSchema = z.object({
  reason: z.string().min(1),
});

/** Never exposed to the model (see RECEPTIONIST_TOOL_DEFINITIONS in
 * tool-definitions.ts) — this action is ALWAYS constructed
 * deterministically by buildRecurringAutoConfirmToolCall
 * (llm-provider.ts), after every occurrence has already been checked.
 * This schema exists purely so that synthetic call round-trips through
 * the exact same JSON.stringify -> JSON.parse -> validate pipeline every
 * other action does (see parseToolCall) — never because the model is
 * trusted to invent one of these itself. */
export const requestRecurringAppointmentSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  service: z.string().min(1),
  startDate: z.string().min(1),
  startTime: z.string().min(1),
  recurrenceIntervalMonths: z.number().int().positive(),
  occurrenceDates: z.array(z.string().min(1)).min(1),
});

/**
 * Not a ReceptionistAction — this is how the model reports which flow the
 * customer wants (new booking vs. reschedule vs. cancellation), the one
 * piece of BookingState that genuinely needs the model's understanding
 * rather than being determinable from a raw message. Every other field
 * (service/date/time/name/phone/pendingAction) is extracted deterministically
 * by the application instead — see src/ai/message-field-extraction.ts and
 * src/ai/booking-progression.ts — and is intentionally NOT part of this
 * schema anymore; whatever the model reports for those (if it reports
 * anything at all) is never read.
 */
export const updateBookingProgressSchema = z.object({
  intent: z.enum([
    "book_appointment",
    "reschedule_appointment",
    "cancel_appointment",
    "book_recurring_appointment",
  ]),
});
