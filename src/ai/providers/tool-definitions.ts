import type OpenAI from "openai";

type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

/**
 * The 5 controlled actions the model may request, plus
 * update_booking_progress — not an action, but the ONE piece of booking
 * state the application can't determine deterministically from a raw
 * message: which flow the customer wants (new booking vs. reschedule vs.
 * cancellation). Every other field (service/date/time/name/phone/
 * pendingAction) is extracted by the application directly from the
 * customer's message instead — see src/ai/message-field-extraction.ts —
 * so this tool's schema deliberately no longer asks the model to report
 * them. This — not database access — is the model's only way to affect
 * anything or persist anything; ReceptionistAgent executes the 5 real
 * actions via ReceptionistTools, and LLMProvider handles
 * update_booking_progress itself to build the returned BookingState.
 */
export const RECEPTIONIST_TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "update_booking_progress",
      description:
        "Report which flow the customer wants: a new booking, a reschedule of an existing appointment, or a cancellation. Call this as soon as that's clear — the application tracks every other detail (service, date, time, name, phone) directly from what the customer says, so you only need to report intent here.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["book_appointment", "reschedule_appointment", "cancel_appointment"],
          },
        },
        required: ["intent"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead",
      description:
        "Record a potential customer's contact info and interest so far, without booking anything yet.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer's name" },
          phone: { type: "string", description: "Customer's phone number, if given" },
          serviceInterest: {
            type: "string",
            description: "Service the customer seems interested in, if known",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_appointment",
      description:
        "Request a new appointment. Only call this once you have the customer's name, phone, requested service, preferred date, and preferred time.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          service: { type: "string" },
          preferredDate: { type: "string" },
          preferredTime: { type: "string" },
        },
        required: ["name", "phone", "service", "preferredDate", "preferredTime"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_reschedule",
      description: "Request moving an existing appointment to a new date/time.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          newPreferredDate: { type: "string" },
          newPreferredTime: { type: "string" },
        },
        required: ["name", "phone", "newPreferredDate", "newPreferredTime"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_cancellation",
      description: "Request cancelling an existing appointment.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          reason: { type: "string" },
        },
        required: ["name", "phone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate",
      description:
        "Hand this conversation off to a staff member instead of continuing to handle it yourself. Use this for emergencies, explicit requests for a human, clinical questions you can't safely answer, or anything you are not confident about.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
];
