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

/**
 * Not a ReceptionistAction — this is how the model reports structured
 * booking progress (what it has learned so far) so LLMProvider can
 * persist it via BookingState, instead of the application re-parsing the
 * model's prose reply to figure out what's known. Every field but
 * `intent` is optional: the model reports whatever it's confident about
 * on a given turn.
 */
export const updateBookingProgressSchema = z.object({
  intent: z.enum(["book_appointment", "reschedule_appointment", "cancel_appointment"]),
  service: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
});
