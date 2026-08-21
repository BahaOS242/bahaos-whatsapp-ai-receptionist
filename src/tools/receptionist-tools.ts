import type {
  CreateLeadPayload,
  EscalatePayload,
  ReceptionistTools,
  RequestAppointmentPayload,
  RequestCancellationPayload,
  RequestReschedulePayload,
  ToolResult,
} from "../ai/types";

/**
 * Simulated implementation of ReceptionistTools: every call "succeeds" and
 * logs what would have happened, but nothing is written to the database or
 * sent anywhere real. Building the real CRM/booking/notification backing
 * for these is out of scope for this milestone (see IMPLEMENTATION_PLAN.md
 * Phase 2/5/6) — this exists so the AI layer has a real, swappable
 * boundary to call through today, matching the "Business Actions
 * (simulated)" stage of the architecture used throughout this project.
 *
 * A future real implementation (backed by the `appointments`, `handoffs`,
 * and `audit_events` tables already defined in src/db/schema.ts) satisfies
 * the same ReceptionistTools interface, so ReceptionistAgent never has to
 * change when that lands.
 */
export const simulatedReceptionistTools: ReceptionistTools = {
  async createLead(payload: CreateLeadPayload): Promise<ToolResult> {
    console.log("[simulated tool] create_lead", payload);
    return { success: true };
  },

  async requestAppointment(payload: RequestAppointmentPayload): Promise<ToolResult> {
    console.log("[simulated tool] request_appointment", payload);
    return { success: true };
  },

  async requestReschedule(payload: RequestReschedulePayload): Promise<ToolResult> {
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
