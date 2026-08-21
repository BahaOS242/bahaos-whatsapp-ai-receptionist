import { isWithinOperatingWindow, validateAppointmentTime } from "../ai/business-hours";
import { BAHAMAS_DENTAL_SERVICE } from "../ai/business-context";
import type {
  BusinessContext,
  CreateLeadPayload,
  EscalatePayload,
  ReceptionistTools,
  RequestAppointmentPayload,
  RequestCancellationPayload,
  RequestReschedulePayload,
  ToolResult,
} from "../ai/types";

/**
 * Simulated implementation of ReceptionistTools: every call logs what
 * would have happened, but nothing is written to a database or sent
 * anywhere real. Building the real CRM/booking/notification backing for
 * these is out of scope for this milestone (see IMPLEMENTATION_PLAN.md
 * Phase 2/5/6) — this exists so the AI layer has a real, swappable
 * boundary to call through today, matching the "Business Actions
 * (simulated)" stage of the architecture used throughout this project.
 *
 * requestAppointment/requestReschedule independently re-validate business
 * hours here, even though DevRuleBasedAIProvider (and, best-effort,
 * LLMProvider) already check before proposing the action. This is the
 * actual enforcement boundary: no AIProvider decision is trusted to be
 * correct, so there is no path — buggy provider, prompt injection, a
 * future provider that skips the check — through which an out-of-hours
 * appointment can be reported as booked. A rejection here flows through
 * ReceptionistAgent's existing "tool returned failure" safety path
 * unchanged (honest fallback reply, auto-escalate, pre-turn state
 * preserved) — no new failure handling was needed.
 *
 * A future real implementation (backed by the `appointments`, `handoffs`,
 * and `audit_events` tables already defined in src/db/schema.ts) satisfies
 * the same ReceptionistTools interface, so ReceptionistAgent never has to
 * change when that lands.
 */
export function createSimulatedReceptionistTools(business: BusinessContext): ReceptionistTools {
  return {
    async createLead(payload: CreateLeadPayload): Promise<ToolResult> {
      console.log("[simulated tool] create_lead", payload);
      return { success: true };
    },

    async requestAppointment(payload: RequestAppointmentPayload): Promise<ToolResult> {
      const service = business.services.find((s) => s.name === payload.service);
      const validation = validateAppointmentTime(
        business,
        payload.preferredDate,
        payload.preferredTime,
        service?.durationMinutes ?? 0,
      );
      if (!validation.valid) {
        console.error(
          "[simulated tool] request_appointment REJECTED (business hours)",
          payload,
          validation,
        );
        return {
          success: false,
          error: `Requested time is outside business hours (${validation.reason}).`,
        };
      }
      console.log("[simulated tool] request_appointment", payload);
      return { success: true };
    },

    async requestReschedule(payload: RequestReschedulePayload): Promise<ToolResult> {
      const validation = isWithinOperatingWindow(
        business,
        payload.newPreferredDate,
        payload.newPreferredTime,
      );
      if (!validation.valid) {
        console.error(
          "[simulated tool] request_reschedule REJECTED (business hours)",
          payload,
          validation,
        );
        return {
          success: false,
          error: `Requested time is outside business hours (${validation.reason}).`,
        };
      }
      console.log("[simulated tool] request_reschedule", payload);
      return { success: true };
    },

    async requestCancellation(payload: RequestCancellationPayload): Promise<ToolResult> {
      console.log("[simulated tool] request_cancellation", payload);
      return { success: true };
    },

    async escalate(payload: EscalatePayload): Promise<ToolResult> {
      console.log("[simulated tool] escalate", payload);
      return { success: true };
    },
  };
}

/** Convenience default bound to the demo tenant, for the dev chat script
 * and anything else that doesn't need a different BusinessContext. */
export const simulatedReceptionistTools: ReceptionistTools =
  createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);
