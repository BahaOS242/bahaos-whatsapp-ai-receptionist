import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResponse,
  BookingState,
  BusinessContext,
  ReceptionistAction,
} from "../types";
import type { LlmChatClient, LlmChatMessage, LlmToolCall } from "./llm-chat-client";
import {
  describeInvalidTime,
  isWithinOperatingWindow,
  validateAppointmentTime,
} from "../business-hours";
import type { BusinessHoursValidation } from "../business-hours";
import {
  createLeadSchema,
  escalateSchema,
  requestAppointmentSchema,
  requestCancellationSchema,
  requestRescheduleSchema,
  updateBookingProgressSchema,
} from "./action-schemas";

/**
 * Thrown when the model's response can't be trusted — no text and no
 * tool calls, or a tool call with unparseable/invalid arguments.
 * ReceptionistAgent treats this exactly like an LLM provider failure: it
 * never partially trusts a response, because a customer-facing "reply"
 * that doesn't match what the model *actually* validly requested is
 * precisely the failure mode the safety requirements are about.
 */
export class MalformedLlmResponseError extends Error {}

const COMPLETING_ACTION_TYPES = new Set<ReceptionistAction["type"]>([
  "request_appointment",
  "request_reschedule",
  "request_cancellation",
]);

export class LLMProvider implements AIProvider {
  constructor(private readonly client: LlmChatClient) {}

  async generateResponse(request: AIProviderRequest): Promise<AIProviderResponse> {
    const systemPrompt = buildSystemPrompt(request);
    const messages: LlmChatMessage[] = [
      ...request.history.map((turn): LlmChatMessage => ({
        role: turn.role === "customer" ? "user" : "assistant",
        content: turn.content,
      })),
      { role: "user", content: request.message },
    ];

    const result = await this.client.chat({ systemPrompt, messages });

    if (result.content === null && result.toolCalls.length === 0) {
      throw new MalformedLlmResponseError("LLM response had no text and no tool calls.");
    }

    const actions: ReceptionistAction[] = [];
    let progressUpdate: Partial<BookingState> | undefined;
    let hoursRejectionReply: string | undefined;

    for (const toolCall of result.toolCalls) {
      if (toolCall.name === "update_booking_progress") {
        const parsed = parseBookingProgress(toolCall);
        if (!parsed) {
          throw new MalformedLlmResponseError(
            "LLM update_booking_progress call had invalid or unparseable arguments.",
          );
        }
        progressUpdate = parsed;
        continue;
      }

      const action = parseToolCall(toolCall);
      if (!action) {
        throw new MalformedLlmResponseError(
          `LLM tool call "${toolCall.name}" had invalid or unparseable arguments.`,
        );
      }

      // Application-level hours validation is authoritative regardless of
      // what the model decided — this is a best-effort check for a good
      // in-conversation rejection message; ReceptionistTools re-checks
      // independently and is the actual hard backstop (see
      // src/tools/receptionist-tools.ts), so the model can never cause a
      // real "success" to be reported for an out-of-hours request even if
      // this check were somehow skipped.
      const hoursCheck = checkActionHours(request.business, action);
      if (hoursCheck && !hoursCheck.validation.valid) {
        hoursRejectionReply = describeInvalidTime(
          request.business,
          hoursCheck.validation,
          hoursCheck.date,
          hoursCheck.time,
        );
        continue; // drop the action — it is never returned to the agent
      }

      actions.push(action);
    }

    let bookingState = deriveBookingState(request.bookingState, progressUpdate, actions);
    if (hoursRejectionReply) {
      // The proposed time was rejected — preserve everything except
      // date/time (even if update_booking_progress reported them this
      // turn), so the customer isn't asked to repeat service/name/phone.
      const { date: _date, time: _time, ...preserved } = bookingState;
      bookingState = preserved;
    }

    return { reply: hoursRejectionReply ?? result.content ?? "", actions, bookingState };
  }
}

function checkActionHours(
  business: BusinessContext,
  action: ReceptionistAction,
): { validation: BusinessHoursValidation; date: string; time: string } | undefined {
  if (action.type === "request_appointment") {
    const service = business.services.find((s) => s.name === action.payload.service);
    const validation = validateAppointmentTime(
      business,
      action.payload.preferredDate,
      action.payload.preferredTime,
      service?.durationMinutes ?? 0,
    );
    return { validation, date: action.payload.preferredDate, time: action.payload.preferredTime };
  }
  if (action.type === "request_reschedule") {
    const validation = isWithinOperatingWindow(
      business,
      action.payload.newPreferredDate,
      action.payload.newPreferredTime,
    );
    return {
      validation,
      date: action.payload.newPreferredDate,
      time: action.payload.newPreferredTime,
    };
  }
  return undefined;
}

/** A completing action (appointment/reschedule/cancellation actually
 * requested) always clears the slate, regardless of any progress update
 * in the same turn. Otherwise, a progress update merges into what was
 * already known; with neither, state passes through unchanged (e.g. a
 * plain FAQ reply that doesn't touch booking at all). */
function deriveBookingState(
  previous: BookingState,
  progressUpdate: Partial<BookingState> | undefined,
  actions: ReceptionistAction[],
): BookingState {
  if (actions.some((a) => COMPLETING_ACTION_TYPES.has(a.type))) {
    return {};
  }
  if (progressUpdate) {
    return { ...previous, ...progressUpdate };
  }
  return previous;
}

function buildSystemPrompt(request: AIProviderRequest): string {
  const { business, customer, bookingState } = request;
  const services = business.services
    .map((s) => `- ${s.name}: ${s.priceLabel}, about ${s.durationMinutes} minutes`)
    .join("\n");
  const known =
    [
      customer.name ? `name: ${customer.name}` : null,
      customer.phone ? `phone: ${customer.phone}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "none yet";

  const bookingKnown =
    [
      bookingState.intent ? `intent: ${bookingState.intent}` : null,
      bookingState.service ? `service: ${bookingState.service}` : null,
      bookingState.date ? `date: ${bookingState.date}` : null,
      bookingState.time ? `time: ${bookingState.time}` : null,
      bookingState.name ? `name: ${bookingState.name}` : null,
      bookingState.phone ? `phone: ${bookingState.phone}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "nothing yet — no booking in progress";

  const weeklyHours = (
    Object.entries(business.weeklyHours) as [string, { open: string; close: string } | null][]
  )
    .map(([day, hours]) => `${day}: ${hours ? `${hours.open}–${hours.close}` : "closed"}`)
    .join(", ");

  return [
    `You are the virtual receptionist for ${business.name}, a dental practice.`,
    `Hours: ${business.hours}. Address: ${business.address}. Timezone: ${business.timezone}.`,
    `Structured weekly hours (24-hour, for your reference only — the application independently validates every requested time against this and will reject anything outside it, so always check before proposing a time): ${weeklyHours}`,
    `Services:\n${services}`,
    `Insurance: ${business.policies.insurance}`,
    `New patients: ${business.policies.newPatientInfo}`,
    `Cancellation policy: appointments can be cancelled up to ${business.policies.cancellationCutoffHours} hours before the scheduled time.`,
    `Emergency policy: ${business.policies.emergencyPolicy}`,
    `Known customer info so far: ${known}`,
    `Current booking state (already confirmed — this is the source of truth, not your memory of the conversation; never ask again for anything listed here): ${bookingKnown}`,
    "",
    "Rules:",
    "- Be conversational, concise, and ask one question at a time. Never re-ask for information already listed in the current booking state above.",
    "- Whenever you're actively collecting booking/reschedule/cancellation info and learn something new, call update_booking_progress with everything you now know (not just the newest field) — the application persists this, not your own memory of the chat.",
    '- Never claim a real appointment is booked, rescheduled, or cancelled — you are only ever requesting it; a staff member confirms it. Phrase it conditionally, e.g. "I\'ve captured your request... a team member will confirm."',
    "- Never invent services, prices, or policies not listed above.",
    "- Never claim a real staff member has already been contacted — only that you've flagged/escalated the request.",
    "- Call request_appointment / request_reschedule / request_cancellation only once every required field for that action is known. Never claim to have taken an action without calling the matching tool.",
    "- If a time is ambiguous (e.g. the customer just says a bare number with no am/pm), ask specifically for clarification — do not guess am/pm, and do not call update_booking_progress with a guessed time.",
    "- Never call request_appointment or request_reschedule for a day the business is closed, or a time outside the structured weekly hours above (an appointment must fully fit before closing, not merely start before it). If the customer asks for such a time, tell them it's outside business hours and ask for a different day/time instead.",
    "- If the customer describes a possible emergency, asks for a human, or asks something you can't confidently answer from the information above, call the escalate tool.",
  ].join("\n");
}

function parseBookingProgress(toolCall: LlmToolCall): Partial<BookingState> | undefined {
  let args: unknown;
  try {
    args = JSON.parse(toolCall.argumentsJson);
  } catch {
    return undefined;
  }
  const parsed = updateBookingProgressSchema.safeParse(args);
  return parsed.success ? parsed.data : undefined;
}

function parseToolCall(toolCall: LlmToolCall): ReceptionistAction | undefined {
  let args: unknown;
  try {
    args = JSON.parse(toolCall.argumentsJson);
  } catch {
    return undefined;
  }

  switch (toolCall.name) {
    case "create_lead": {
      const parsed = createLeadSchema.safeParse(args);
      return parsed.success ? { type: "create_lead", payload: parsed.data } : undefined;
    }
    case "request_appointment": {
      const parsed = requestAppointmentSchema.safeParse(args);
      return parsed.success ? { type: "request_appointment", payload: parsed.data } : undefined;
    }
    case "request_reschedule": {
      const parsed = requestRescheduleSchema.safeParse(args);
      return parsed.success ? { type: "request_reschedule", payload: parsed.data } : undefined;
    }
    case "request_cancellation": {
      const parsed = requestCancellationSchema.safeParse(args);
      return parsed.success ? { type: "request_cancellation", payload: parsed.data } : undefined;
    }
    case "escalate": {
      const parsed = escalateSchema.safeParse(args);
      return parsed.success ? { type: "escalate", payload: parsed.data } : undefined;
    }
    default:
      return undefined;
  }
}
