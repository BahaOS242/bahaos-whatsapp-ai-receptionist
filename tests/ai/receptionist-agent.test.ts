import { describe, expect, it, vi } from "vitest";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResponse,
  ReceptionistTools,
} from "../../src/ai/types";

function request(message = "hello"): AIProviderRequest {
  return { business: BAHAMAS_DENTAL_SERVICE, customer: {}, history: [], message, bookingState: {} };
}

class FakeAIProvider implements AIProvider {
  constructor(private readonly respond: () => AIProviderResponse | Promise<AIProviderResponse>) {}
  async generateResponse(): Promise<AIProviderResponse> {
    return this.respond();
  }
}

class ThrowingAIProvider implements AIProvider {
  constructor(private readonly error: unknown) {}
  async generateResponse(): Promise<AIProviderResponse> {
    throw this.error;
  }
}

/** All tools succeed by default; individual tests override specific ones. */
function makeTools(overrides: Partial<ReceptionistTools> = {}): ReceptionistTools {
  return {
    createLead: vi.fn(async () => ({ success: true })),
    requestAppointment: vi.fn(async () => ({ success: true })),
    requestReschedule: vi.fn(async () => ({ success: true })),
    requestCancellation: vi.fn(async () => ({ success: true })),
    requestRecurringAppointment: vi.fn(async () => ({ success: true })),
    escalate: vi.fn(async () => ({ success: true })),
    ...overrides,
  };
}

describe("ReceptionistAgent — lead capture", () => {
  it("executes create_lead via tools and forwards the provider's reply on success", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "Thanks Sarah, I've got your details.",
      actions: [{ type: "create_lead", payload: { name: "Sarah Combs", phone: "242-555-0199" } }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.createLead).toHaveBeenCalledWith({ name: "Sarah Combs", phone: "242-555-0199" });
    expect(result.reply).toBe("Thanks Sarah, I've got your details.");
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — appointment request", () => {
  it("executes request_appointment and reports success", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "2pm",
    };
    const provider = new FakeAIProvider(() => ({
      reply:
        "Perfect — I've captured your request for Routine cleaning on Tuesday at 2pm. A member of the team would confirm the appointment.",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.requestAppointment).toHaveBeenCalledWith(payload);
    expect(result.reply).toContain("captured your request");
    expect(result.reply).not.toMatch(/is booked|confirmed your appointment/i);
    expect(result.safetyOverride).toBe(false);
  });
});

/**
 * Second bug report finding: `request_appointment -> ok` means different
 * things depending on which ReceptionistTools implementation is wired in
 * — createSimulatedReceptionistTools validates only (nothing written;
 * this is what the reported live test used, and its reply was already
 * accurate); createDatabaseReceptionistTools/
 * createGoogleCalendarReceptionistTools genuinely persist a row/event
 * (see ToolResult.persisted). The provider can't know which backend it's
 * talking to when it composes its generic completing-action filler
 * (before the tool even runs), so it marks that reply via
 * completingActionReplyIsGeneric and ReceptionistAgent — the one place
 * with the real, post-execution ToolResult — decides whether something
 * more concrete is actually true. A model-generated reply is NEVER
 * second-guessed, only this specific hardcoded filler.
 */
describe("ReceptionistAgent — accurate reply when a completing action is genuinely persisted", () => {
  it("swaps the generic filler for a concrete reply when ToolResult.persisted is true (e.g. the database-backed tools)", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "14:00",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "I've captured your request — a team member will confirm.",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
      completingActionReplyIsGeneric: true,
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({ success: true, persisted: true })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).toContain("Routine cleaning");
    expect(result.reply).toContain("2:00 PM");
    expect(result.reply).not.toBe("I've captured your request — a team member will confirm.");
  });

  it("leaves the generic filler untouched when nothing was actually persisted (e.g. the simulated tools — validated only)", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "14:00",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "I've captured your request — a team member will confirm.",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
      completingActionReplyIsGeneric: true,
    }));
    // makeTools()'s default requestAppointment returns { success: true }
    // with no `persisted` — exactly createSimulatedReceptionistTools'
    // real, current behavior.
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).toBe("I've captured your request — a team member will confirm.");
  });

  it("never overrides a model-generated reply, even when persisted is true", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "14:00",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "Sounds great, Sarah! Anything else before I let you go?",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
      // completingActionReplyIsGeneric intentionally omitted — this is a
      // real model-composed reply, never the hardcoded filler.
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({ success: true, persisted: true })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).toBe("Sounds great, Sarah! Anything else before I let you go?");
  });

  it("also applies to a persisted reschedule/cancellation, not just a new booking", async () => {
    const reschedulePayload = {
      name: "John Miller",
      phone: "242-555-0111",
      newPreferredDate: "Thursday",
      newPreferredTime: "10:00",
    };
    const rescheduleProvider = new FakeAIProvider(() => ({
      reply: "Got it — I've noted your request to move your appointment to Thursday at 10:00. Someone from the team will confirm the change.",
      actions: [{ type: "request_reschedule", payload: reschedulePayload }],
      bookingState: {},
      completingActionReplyIsGeneric: true,
    }));
    const rescheduleTools = makeTools({
      requestReschedule: vi.fn(async () => ({ success: true, persisted: true })),
    });
    const rescheduleResult = await new ReceptionistAgent(rescheduleProvider, rescheduleTools).handleMessage(
      request(),
    );
    expect(rescheduleResult.reply).toContain("10:00 AM");

    const cancelPayload = { name: "John Miller", phone: "242-555-0111" };
    const cancelProvider = new FakeAIProvider(() => ({
      reply: "Understood — I've flagged John Miller's appointment for cancellation. The team will confirm it's been cancelled.",
      actions: [{ type: "request_cancellation", payload: cancelPayload }],
      bookingState: {},
      completingActionReplyIsGeneric: true,
    }));
    const cancelTools = makeTools({
      requestCancellation: vi.fn(async () => ({ success: true, persisted: true })),
    });
    const cancelResult = await new ReceptionistAgent(cancelProvider, cancelTools).handleMessage(request());
    expect(cancelResult.reply).toBe("Done — that appointment has been cancelled.");
  });
});

describe("ReceptionistAgent — reschedule", () => {
  it("executes request_reschedule and reports success", async () => {
    const payload = {
      name: "John Miller",
      phone: "242-555-0111",
      newPreferredDate: "Thursday",
      newPreferredTime: "10am",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "Got it — I've noted your request to move your appointment to Thursday at 10am.",
      actions: [{ type: "request_reschedule", payload }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.requestReschedule).toHaveBeenCalledWith(payload);
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — cancellation", () => {
  it("executes request_cancellation and reports success", async () => {
    const payload = { name: "John Miller", phone: "242-555-0111" };
    const provider = new FakeAIProvider(() => ({
      reply: "Understood — I've flagged your appointment for cancellation.",
      actions: [{ type: "request_cancellation", payload }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(tools.requestCancellation).toHaveBeenCalledWith(payload);
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — escalation", () => {
  it("executes escalate and forwards the handoff reply", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "I'd be happy to have someone from the clinic team help with that.",
      actions: [{ type: "escalate", payload: { reason: "customer asked for a human" } }],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    // conversationId is omitted (request() carries none); bookingStateSnapshot
    // is always stamped on, even when empty — see ReceptionistAgent.executeAction.
    expect(tools.escalate).toHaveBeenCalledWith({
      reason: "customer asked for a human",
      bookingStateSnapshot: {},
    });
    expect(result.reply).toContain("clinic team");
    expect(result.safetyOverride).toBe(false);
  });
});

describe("ReceptionistAgent — safety: failed booking", () => {
  it("never forwards the provider's success-sounding reply when the tool reports failure, and auto-escalates", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "2pm",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "Perfect — I've captured your request for Routine cleaning on Tuesday at 2pm.",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({
        success: false,
        error: "booking system unavailable",
      })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).not.toContain("Perfect — I've captured your request");
    expect(result.reply.toLowerCase()).not.toMatch(/captured|confirmed|booked/);
    expect(result.safetyOverride).toBe(true);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
    expect(result.actionsTaken.some((a) => a.action.type === "escalate" && a.result.success)).toBe(
      true,
    );
  });
});

describe("ReceptionistAgent — REGRESSION (Phase 1 DB wiring): graceful slot-conflict recovery, never escalates", () => {
  // The database booking layer (src/db/appointments.ts) can genuinely
  // lose a race even after the in-memory availability check said a slot
  // looked open — see PHASE1_PROGRESS.md's design note. This must be
  // treated as a normal, recoverable outcome (offer alternatives), never
  // as a hard failure requiring human escalation.
  it("does NOT escalate on a slot-conflict failure; composes an accurate reply with real alternatives, and preserves bookingState minus time/pendingAction", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "Perfect, you're all set for Tuesday at 2pm!", // optimistic/wrong — must never reach the customer
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
      ],
      bookingState: {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
        pendingAction: "confirm_service",
      },
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({
        success: false,
        error: "Requested time is no longer available (lost a booking race).",
        recoverable: { reason: "slot_conflict" as const, alternativeTimes: ["09:00", "09:30", "10:00"] },
      })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).not.toContain("you're all set");
    expect(result.reply).toMatch(/just taken while i was booking it/i);
    expect(result.reply).toMatch(/9:00 AM/);
    expect(result.reply).toMatch(/9:30 AM/);
    expect(result.reply).toMatch(/10:00 AM/);
    expect(result.safetyOverride).toBe(true);
    // The critical safety property: never escalates for this recoverable case.
    expect(tools.escalate).not.toHaveBeenCalled();
    expect(result.handoffActive).toBe(false);
    expect(result.actionsTaken.some((a) => a.action.type === "escalate")).toBe(false);
    // Everything the customer already gave survives — just time/pendingAction cleared.
    expect(result.bookingState).toEqual({
      intent: "book_appointment",
      service: "Routine cleaning",
      date: "Tuesday",
      name: "Trevor",
      phone: "+12428012847",
    });
  });

  // Genuine defect found live (V1 hardening pass): LLMProvider's
  // deriveBookingState arms bookingJustCompleted/lastCompletedBooking
  // optimistically, from the action the model PROPOSED, before this file
  // ever learns whether execution actually succeeded (deriveBookingState
  // runs inside provider.generateResponse, strictly before the
  // executeAction loop). Left armed on a slot-conflict failure, the next
  // customer turn would falsely believe a booking was completed — a
  // simple "actually, Wednesday instead" would misfire
  // detectPostCompletionReschedule's post-completion-correction path and
  // try to reschedule a booking that was never created, instead of simply
  // picking a new time within the still-open flow. Both fields must be
  // stripped alongside time/pendingAction on this exact recovery path.
  it("also strips bookingJustCompleted/lastCompletedBooking on a slot-conflict failure — nothing was actually booked", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "Perfect, you're all set for Tuesday at 2pm!", // optimistic/wrong — must never reach the customer
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
      ],
      bookingState: {
        // Mirrors exactly what LLMProvider's deriveBookingState produces
        // for a completing action — a full reset to just these two
        // fields, optimistically set before execution runs.
        bookingJustCompleted: true,
        lastCompletedBooking: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
          phone: "+12428012847",
        },
      },
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({
        success: false,
        error: "Requested time is no longer available (lost a booking race).",
        recoverable: { reason: "slot_conflict" as const, alternativeTimes: ["09:00", "09:30", "10:00"] },
      })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.bookingState).not.toHaveProperty("bookingJustCompleted");
    expect(result.bookingState).not.toHaveProperty("lastCompletedBooking");
    expect(result.bookingState).toEqual({});
  });

  // The recoverable-slot-conflict check in ReceptionistAgent is generic
  // over action type (checks executed.result.recoverable, not which
  // action produced it) — database-receptionist-tools.ts's
  // requestReschedule sets the exact same `recoverable` shape on a
  // conflict as requestAppointment does. This proves that path actually
  // triggers the graceful reply too, not just the booking one covered
  // above.
  it("also does NOT escalate on a reschedule slot-conflict failure; composes the same graceful reply", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "Great, you're moved to Wednesday at 11am!", // optimistic/wrong — must never reach the customer
      actions: [
        {
          type: "request_reschedule",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            newPreferredDate: "Wednesday",
            newPreferredTime: "11:00",
          },
        },
      ],
      bookingState: {
        intent: "reschedule_appointment",
        date: "Wednesday",
        time: "11:00",
        name: "Trevor",
        phone: "+12428012847",
        pendingAction: "confirm_service",
      },
    }));
    const tools = makeTools({
      requestReschedule: vi.fn(async () => ({
        success: false,
        error: "Requested new time is no longer available (lost a booking race).",
        recoverable: { reason: "slot_conflict" as const, alternativeTimes: ["11:30", "12:00"] },
      })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).not.toContain("you're moved");
    expect(result.reply).toMatch(/just taken while i was booking it/i);
    expect(result.reply).toMatch(/11:30 AM/);
    expect(result.reply).toMatch(/12:00 PM/);
    expect(result.safetyOverride).toBe(true);
    expect(tools.escalate).not.toHaveBeenCalled();
    expect(result.handoffActive).toBe(false);
    expect(result.actionsTaken.some((a) => a.action.type === "escalate")).toBe(false);
    expect(result.bookingState).toEqual({
      intent: "reschedule_appointment",
      date: "Wednesday",
      name: "Trevor",
      phone: "+12428012847",
    });
  });

  it("composes an accurate reply even with zero alternatives, still without escalating", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "unused",
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
      ],
      bookingState: {},
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({
        success: false,
        error: "Requested time is no longer available (lost a booking race).",
        recoverable: { reason: "slot_conflict" as const, alternativeTimes: [] },
      })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).toMatch(/just taken while i was booking it/i);
    expect(result.reply).toMatch(/don't have any other openings that day/i);
    expect(tools.escalate).not.toHaveBeenCalled();
  });

  it("PRESERVED SAFETY: a slot-conflict failure MIXED with a genuinely different failure still hard-escalates, unchanged", async () => {
    // Two actions this turn, one a recoverable conflict, the other a
    // real failure — must NOT take the graceful-recovery shortcut.
    const provider = new FakeAIProvider(() => ({
      reply: "unused",
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
        { type: "create_lead", payload: { name: "Trevor", phone: "+12428012847" } },
      ],
      bookingState: {},
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({
        success: false,
        error: "Requested time is no longer available (lost a booking race).",
        recoverable: { reason: "slot_conflict" as const, alternativeTimes: ["09:00"] },
      })),
      createLead: vi.fn(async () => ({ success: false, error: "unrelated real failure" })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
    expect(result.handoffActive).toBe(true);
    expect(result.reply).toBe(
      "Sorry — I wasn't able to complete that. I've flagged this for the team to follow up with you directly.",
    );
  });

  it("PRESERVED SAFETY: an ordinary tool failure with no `recoverable` field still hard-escalates, byte-identical to before this change", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "Perfect — I've captured your request.",
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
      ],
      bookingState: {},
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({ success: false, error: "booking system unavailable" })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
    expect(result.handoffActive).toBe(true);
    expect(result.bookingState).toEqual({});
  });
});

describe("ReceptionistAgent — safety: malformed provider response", () => {
  it("falls back to an honest reply and escalates when the provider throws a malformed-response error", async () => {
    const provider = new ThrowingAIProvider(new Error("LLM tool call had invalid arguments"));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(result.reply.toLowerCase()).not.toMatch(/booked|confirmed|cancelled/);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
  });
});

describe("ReceptionistAgent — safety: LLM provider failure", () => {
  it("falls back to an honest reply and escalates when the provider call rejects", async () => {
    const provider = new ThrowingAIProvider(new Error("network timeout"));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(result.reply).toMatch(/wasn't able to complete/i);
    expect(tools.escalate).toHaveBeenCalledTimes(1);
  });

  it("still returns a safe reply even if the escalate tool itself fails", async () => {
    const provider = new ThrowingAIProvider(new Error("network timeout"));
    const tools = makeTools({
      escalate: vi.fn(async () => ({ success: false, error: "escalation channel down" })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.reply).toMatch(/wasn't able to complete/i);
    expect(result.safetyOverride).toBe(true);
  });
});

describe("ReceptionistAgent — handoff enforcement (ROOT CAUSE #9 regression)", () => {
  it("blocks automation on a turn where handoffActive is already true, WITHOUT calling the provider", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "Perfect — I've captured your request.",
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
      ],
      bookingState: {},
    }));
    const generateResponse = vi.spyOn(provider, "generateResponse");
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage({ ...request("Tuesday 2pm"), handoffActive: true });

    expect(generateResponse).not.toHaveBeenCalled();
    expect(tools.requestAppointment).not.toHaveBeenCalled();
    expect(result.actionsTaken).toEqual([]);
    expect(result.bookingState).toEqual({});
    expect(result.handoffActive).toBe(true);
  });

  it("sets handoffActive and clears bookingState the moment an escalate action succeeds", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "I've flagged this for our team.",
      actions: [{ type: "escalate", payload: { reason: "customer asked for a person" } }],
      bookingState: { intent: "book_appointment", service: "Routine cleaning" },
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.handoffActive).toBe(true);
    // Even though the provider itself returned a non-empty bookingState,
    // ReceptionistAgent overrides it — the enforcement doesn't depend on
    // the provider clearing its own state correctly.
    expect(result.bookingState).toEqual({});
  });

  it("does not set handoffActive when a turn has no active flow and nothing escalates", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "We're open Monday to Friday.",
      actions: [],
      bookingState: {},
    }));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.handoffActive).toBe(false);
  });

  it("also sets handoffActive on the safety-fallback path (malformed/failed provider), since that always escalates too", async () => {
    const provider = new ThrowingAIProvider(new Error("network timeout"));
    const tools = makeTools();
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.handoffActive).toBe(true);
    expect(result.bookingState).toEqual({});
  });

  it("a failed booking action still ends in handoff, via ReceptionistAgent's own auto-escalate", async () => {
    const payload = {
      name: "Sarah Combs",
      phone: "242-555-0199",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "2pm",
    };
    const provider = new FakeAIProvider(() => ({
      reply: "Perfect — I've captured your request.",
      actions: [{ type: "request_appointment", payload }],
      bookingState: {},
    }));
    const tools = makeTools({
      requestAppointment: vi.fn(async () => ({
        success: false,
        error: "booking system unavailable",
      })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.handoffActive).toBe(true);
    expect(result.bookingState).toEqual({});
  });

  it("does NOT set handoffActive if the escalate action itself fails (never confirmed as actually escalated)", async () => {
    const provider = new FakeAIProvider(() => ({
      reply: "I've flagged this for our team.",
      actions: [{ type: "escalate", payload: { reason: "customer asked for a person" } }],
      bookingState: { intent: "book_appointment" },
    }));
    const tools = makeTools({
      escalate: vi.fn(async () => ({ success: false, error: "escalation channel down" })),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.handoffActive).toBe(false);
  });
});

describe("ReceptionistAgent — safety: tool failure (throws, not just returns failure)", () => {
  it("catches a tool that throws instead of crashing the turn, and never claims success", async () => {
    const payload = { name: "John Miller", phone: "242-555-0111" };
    const provider = new FakeAIProvider(() => ({
      reply: "Understood — I've flagged your appointment for cancellation.",
      actions: [{ type: "request_cancellation", payload }],
      bookingState: {},
    }));
    const tools = makeTools({
      requestCancellation: vi.fn(async () => {
        throw new Error("database connection lost");
      }),
    });
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage(request());

    expect(result.safetyOverride).toBe(true);
    expect(result.reply).not.toContain("flagged your appointment for cancellation");
    expect(result.actionsTaken[0].result.success).toBe(false);
    expect(result.actionsTaken[0].result.error).toContain("database connection lost");
  });
});
