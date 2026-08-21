import type OpenAI from "openai";

type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

/**
 * The 5 controlled actions the model may request, plus
 * update_booking_progress — not an action, but how the model reports
 * structured booking fields as it learns them, so the application never
 * has to re-parse the model's prose reply to figure out what's already
 * known. This — not database access — is the model's only way to affect
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
        "Report the current state of an in-progress booking, reschedule, or cancellation as structured fields. Call this on every turn where you're actively collecting booking information — even if you don't have everything yet — so the application can track what's already known. Only include fields you're confident about; omit anything still unknown. date should be a weekday name (e.g. \"Tuesday\"); time should be 24-hour HH:MM (e.g. \"18:00\") — never call this with an ambiguous or guessed time.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["book_appointment", "reschedule_appointment", "cancel_appointment"],
          },
          service: { type: "string" },
          date: { type: "string", description: 'Weekday name, e.g. "Tuesday"' },
          time: { type: "string", description: '24-hour HH:MM, e.g. "18:00"' },
          name: { type: "string" },
          phone: { type: "string" },
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
