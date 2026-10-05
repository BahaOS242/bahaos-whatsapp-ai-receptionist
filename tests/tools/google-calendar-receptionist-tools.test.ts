import { describe, expect, it } from "vitest";
import { createGoogleCalendarReceptionistTools } from "../../src/tools/google-calendar-receptionist-tools";
import { nextDateForWeekday } from "../../src/tools/calendar/calendar-datetime";
import {
  createInMemoryAppointmentStore,
  createInMemoryReconciliationQueue,
} from "../../src/tools/calendar/internal-appointment-store";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import type {
  CalendarClient,
  CalendarEvent,
  CalendarEventInput,
  BusyInterval,
} from "../../src/tools/calendar/calendar-client";
import type { AIProvider, AIProviderResponse, RequestAppointmentPayload } from "../../src/ai/types";

/**
 * Fake CalendarClient — no network, deterministic, and realistic enough
 * to actually prove the concurrency test: created events are tracked and
 * subsequently reported busy by listBusyTimes, exactly like a real
 * calendar would.
 */
class FakeCalendarClient implements CalendarClient {
  events: CalendarEvent[] = [];
  createEventCalls = 0;
  listBusyTimesCalls = 0;
  createEventShouldFail = false;
  createEventDelayMs = 0;
  private nextId = 1;

  async listBusyTimes(startDateTime: string, endDateTime: string): Promise<BusyInterval[]> {
    this.listBusyTimesCalls++;
    return this.events
      .filter((e) => overlaps(e.startDateTime, e.endDateTime, startDateTime, endDateTime))
      .map((e) => ({ startDateTime: e.startDateTime, endDateTime: e.endDateTime }));
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    this.createEventCalls++;
    if (this.createEventDelayMs > 0) await sleep(this.createEventDelayMs);
    if (this.createEventShouldFail) throw new Error("simulated calendar failure");
    const event: CalendarEvent = {
      id: `evt_${this.nextId++}`,
      startDateTime: input.startDateTime,
      endDateTime: input.endDateTime,
    };
    this.events.push(event);
    return event;
  }

  async updateEvent(eventId: string, input: CalendarEventInput): Promise<CalendarEvent> {
    return { id: eventId, startDateTime: input.startDateTime, endDateTime: input.endDateTime };
  }

  async deleteEvent(): Promise<void> {}
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const VALID_PAYLOAD: RequestAppointmentPayload = {
  name: "Trevor",
  phone: "+12428012847",
  service: "Basic filling", // 45 minutes
  preferredDate: "Tuesday",
  preferredTime: "14:00",
};

describe("Google Calendar tools — 1. available slot", () => {
  it("creates a Google Calendar event and an internal appointment record", async () => {
    const calendar = new FakeCalendarClient();
    const store = createInMemoryAppointmentStore();
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar, {
      store,
    });

    const result = await tools.requestAppointment(VALID_PAYLOAD);

    // persisted: true — a real calendar event + internal record now
    // exist, distinct from the simulated tools' validated-only success.
    expect(result).toEqual({ success: true, persisted: true });
    expect(calendar.createEventCalls).toBe(1);
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0]).toMatchObject({ name: "Trevor", service: "Basic filling" });
  });
});

describe("Google Calendar tools — 2. busy slot", () => {
  it("creates neither a calendar event nor a successful appointment when the slot is busy", async () => {
    const calendar = new FakeCalendarClient();
    // Pre-populate the calendar with a conflicting event covering the
    // same window the valid payload will request. Genuine pre-existing
    // bug found running this suite on a later date than it was written:
    // a HARDCODED "2026-08-25" only actually matched "the next Tuesday
    // from real wall-clock now" (what toCalendarRange/VALID_PAYLOAD's
    // "Tuesday" resolves against) on the specific days that date was
    // still in the future — once "now" rolled past it, "Tuesday" started
    // resolving to a LATER Tuesday than this hardcoded conflict, and the
    // test silently stopped proving anything. Computed the same way
    // production code resolves it instead, so this test is correct on
    // every day it's ever run, not just the day it was written.
    const conflictDate = nextDateForWeekday("Tuesday");
    await calendar.createEvent({
      summary: "Existing appointment",
      startDateTime: `${conflictDate}T14:00:00`,
      endDateTime: `${conflictDate}T14:45:00`,
      timeZone: BAHAMAS_DENTAL_SERVICE.timezone,
    });
    calendar.createEventCalls = 0; // reset — only counting calls from the tool under test

    const store = createInMemoryAppointmentStore();
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar, {
      store,
    });

    const result = await tools.requestAppointment(VALID_PAYLOAD);

    expect(result.success).toBe(false);
    expect(calendar.createEventCalls).toBe(0);
    expect(store.all()).toHaveLength(0);
  });
});

describe("Google Calendar tools — 3/4. never calls Google for an obviously invalid request", () => {
  it("does not call the calendar API for an outside-business-hours time", async () => {
    const calendar = new FakeCalendarClient();
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar);

    const result = await tools.requestAppointment({ ...VALID_PAYLOAD, preferredTime: "18:00" });

    expect(result.success).toBe(false);
    expect(calendar.listBusyTimesCalls).toBe(0);
    expect(calendar.createEventCalls).toBe(0);
  });

  it("does not call the calendar API for a closed day", async () => {
    const calendar = new FakeCalendarClient();
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar);

    const result = await tools.requestAppointment({ ...VALID_PAYLOAD, preferredDate: "Sunday" });

    expect(result.success).toBe(false);
    expect(calendar.listBusyTimesCalls).toBe(0);
    expect(calendar.createEventCalls).toBe(0);
  });
});

describe("Google Calendar tools — 5. calendar event creation failure", () => {
  it("returns honest tool failure when event creation throws", async () => {
    const calendar = new FakeCalendarClient();
    calendar.createEventShouldFail = true;
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar);

    const result = await tools.requestAppointment(VALID_PAYLOAD);

    expect(result.success).toBe(false);
  });

  it("lets ReceptionistAgent's existing failure/escalation path handle it end to end", async () => {
    const calendar = new FakeCalendarClient();
    calendar.createEventShouldFail = true;
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar);

    const provider: AIProvider = {
      async generateResponse(): Promise<AIProviderResponse> {
        return {
          reply: "Perfect — booking that now.",
          actions: [{ type: "request_appointment", payload: VALID_PAYLOAD }],
          bookingState: {},
        };
      },
    };
    const agent = new ReceptionistAgent(provider, tools);

    const result = await agent.handleMessage({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history: [],
      message: "book it",
      bookingState: {},
    });

    expect(result.safetyOverride).toBe(true);
    expect(result.reply).toMatch(/wasn't able to complete/i);
    expect(result.actionsTaken.some((a) => a.action.type === "escalate")).toBe(true);
  });
});

describe("Google Calendar tools — 6. internal write fails after calendar success", () => {
  it("reports success (never a false failure) and queues the booking for reconciliation", async () => {
    const calendar = new FakeCalendarClient();
    const reconciliationQueue = createInMemoryReconciliationQueue();
    const failingStore = {
      async findByIdempotencyKey() {
        return undefined;
      },
      async save(): Promise<void> {
        throw new Error("database connection lost");
      },
    };
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar, {
      store: failingStore,
      reconciliationQueue,
    });

    const result = await tools.requestAppointment(VALID_PAYLOAD);

    expect(result.success).toBe(true); // the calendar event is real — never told "failed"
    expect(calendar.createEventCalls).toBe(1);

    const queued = await reconciliationQueue.list();
    expect(queued).toHaveLength(1);
    expect(queued[0].googleEventId).toBe(calendar.events[0].id);
    expect(queued[0].reason).toContain("database connection lost");
  });
});

describe("Google Calendar tools — 7. idempotent repeat request", () => {
  it("does not create a duplicate calendar event for an identical repeated request", async () => {
    const calendar = new FakeCalendarClient();
    const store = createInMemoryAppointmentStore();
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar, {
      store,
    });

    const first = await tools.requestAppointment(VALID_PAYLOAD);
    const second = await tools.requestAppointment(VALID_PAYLOAD); // identical retry

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(calendar.createEventCalls).toBe(1); // only one real event
    expect(store.all()).toHaveLength(1);
  });
});

describe("Google Calendar tools — 8. concurrent requests for the same slot", () => {
  it("only one of two simultaneous requests for the same slot can succeed", async () => {
    const calendar = new FakeCalendarClient();
    calendar.createEventDelayMs = 15; // widen the race window
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar);

    const payloadA = { ...VALID_PAYLOAD, name: "Trevor", phone: "+12428012847" };
    const payloadB = { ...VALID_PAYLOAD, name: "Sarah", phone: "+12425550199" };

    const [resultA, resultB] = await Promise.all([
      tools.requestAppointment(payloadA),
      tools.requestAppointment(payloadB),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    expect(successes).toHaveLength(1);
    expect(calendar.createEventCalls).toBe(1);
  });
});

describe("Google Calendar tools — 9. service duration respected", () => {
  it("computes the event end time from the requested service's duration", async () => {
    const calendar = new FakeCalendarClient();
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar);

    await tools.requestAppointment({
      ...VALID_PAYLOAD,
      service: "Root canal",
      preferredTime: "10:00",
    }); // 90 min

    expect(calendar.events[0].startDateTime).toContain("T10:00:00");
    expect(calendar.events[0].endDateTime).toContain("T11:30:00");
  });

  it("rejects a start time that would run past closing given the service's duration", async () => {
    const calendar = new FakeCalendarClient();
    const tools = createGoogleCalendarReceptionistTools(BAHAMAS_DENTAL_SERVICE, calendar);

    // Root canal is 90 minutes; 16:00 + 90min = 17:30, past the 17:00 close.
    const result = await tools.requestAppointment({
      ...VALID_PAYLOAD,
      service: "Root canal",
      preferredTime: "16:00",
    });

    expect(result.success).toBe(false);
    expect(calendar.listBusyTimesCalls).toBe(0);
  });
});
