import { describe, expect, it } from "vitest";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { nextRequiredField } from "../../src/ai/booking-progression";
import { ScriptedLlmChatClient } from "../torture/helpers";
import { DETERMINISTIC_SCENARIOS, HELD_SLOT_BUSINESS } from "./fixtures/deterministic-scenarios";
import type { LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type { BusinessContext, ConversationTurn, ReceptionistAgentResult } from "../../src/ai/types";

/**
 * Deterministic 10-scenario regression suite — the real ReceptionistAgent
 * + ConversationManager + LLMProvider stack (exactly what scripts/dev-chat.ts
 * and production drive), with a ScriptedLlmChatClient standing in for the
 * model so every scenario runs with zero network calls and a fixed,
 * reproducible model response per turn. Application-owned BookingState
 * (src/ai/message-field-extraction.ts, src/ai/booking-progression.ts) does
 * the actual field tracking, independent of whatever the scripted "model"
 * does or doesn't report — these tests exist specifically to catch "the
 * reply sounded right but the state underneath was wrong."
 *
 * Each `it` block asserts BookingState after every turn that matters, not
 * just the final one, per the reporting requirement this suite was built
 * for.
 *
 * The customer message sequences (and the held-slot business fixture for
 * scenario 7) come from ./fixtures/deterministic-scenarios.ts — the same
 * corpus scripts/eval-llm-comparison replays against real Anthropic/
 * OpenRouter models, so the two are guaranteed to exercise byte-for-byte
 * identical customer inputs rather than two copies that could drift.
 */

const scenarioMessages = (id: number): string[] => {
  const scenario = DETERMINISTIC_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`No fixture scenario with id ${id}`);
  return scenario.messages;
};

const updateIntent = (
  intent: "book_appointment" | "reschedule_appointment" | "cancel_appointment" = "book_appointment",
) => JSON.stringify({ intent });

async function runScript(
  script: LlmChatResult[],
  messages: string[],
  business: BusinessContext = BAHAMAS_DENTAL_SERVICE,
): Promise<ReceptionistAgentResult[]> {
  const client = new ScriptedLlmChatClient(script);
  const agent = new ReceptionistAgent(new LLMProvider(client), createSimulatedReceptionistTools(business));
  const manager = new ConversationManager();
  const history: ConversationTurn[] = [];
  const results: ReceptionistAgentResult[] = [];

  for (const message of messages) {
    const request = manager.buildRequest({ business, customer: {}, history, message });
    const result = await agent.handleMessage(request);
    results.push(result);
    history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
    manager.setBookingState(result.bookingState);
    manager.setHandoffActive(result.handoffActive);
  }

  return results;
}

describe("Deterministic 10-scenario evaluation — application-owned BookingState", () => {
  it("1. Normal booking: service -> date/time -> name/phone -> confirm -> booked", async () => {
    const [t1, t2, t3, t4, t5] = await runScript(
      [
        {
          content: "Sure — which service would you like?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "Great! What day and time works for you?", toolCalls: [] },
        { content: "Could I get your name?", toolCalls: [] },
        {
          content: null,
          toolCalls: [{ id: "c2", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "unused — auto-confirm should bypass the model entirely", toolCalls: [] },
      ],
      scenarioMessages(1),
    );

    expect(nextRequiredField(t1.bookingState)).toBe("service");
    expect(t2.bookingState.service).toBe("Routine cleaning");
    expect(nextRequiredField(t2.bookingState)).toBe("date");
    expect(t3.bookingState).toMatchObject({ date: "Tuesday", time: "14:00" });
    expect(nextRequiredField(t3.bookingState)).toBe("name");
    expect(t4.bookingState).toMatchObject({
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    });
    expect(nextRequiredField(t4.bookingState)).toBeUndefined();

    // "yes" auto-confirms without ever needing the (unused) scripted reply.
    expect(t5.actionsTaken).toEqual([
      {
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
        result: { success: true },
      },
    ]);
    // State clears but retains bookingJustCompleted — deterministic proof
    // a booking was just made, so a later hallucinated repeat is blocked
    // (see tests/ai/llm-provider.test.ts's duplicate-booking regressions)
    // — plus a snapshot of what was actually booked, so a correction on
    // the very next turn can be converted into a reschedule request (see
    // tests/ai/llm-provider.test.ts's post-completion-reschedule
    // regressions).
    expect(t5.bookingState).toEqual({
      bookingJustCompleted: true,
      lastCompletedBooking: {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
      },
    });
  });

  it("2. Information supplied out of order: name+phone before intent, service+date/time after", async () => {
    const [t1, t2, t3] = await runScript(
      [
        { content: "Thanks Sarah! What can I help you with today?", toolCalls: [] },
        {
          content: "Got it — what day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        {
          content: null,
          toolCalls: [{ id: "c2", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
      ],
      scenarioMessages(2),
    );

    // Name/phone captured before any intent exists — proves out-of-order
    // capture works, and (this is the bug the eval caught) the greedy
    // "my name is X" regex no longer swallows the next clause's "and".
    expect(t1.bookingState).toEqual({ name: "Sarah", phone: "+12428012847" });

    expect(t2.bookingState).toMatchObject({ service: "Basic filling", intent: "book_appointment" });
    expect(nextRequiredField(t2.bookingState)).toBe("date");

    expect(t3.bookingState).toMatchObject({
      name: "Sarah",
      phone: "+12428012847",
      service: "Basic filling",
      date: "Wednesday",
      time: "11:00",
      pendingAction: "confirm_service",
    });
    expect(nextRequiredField(t3.bookingState)).toBeUndefined();
  });

  it("3. Garbage/invalid responses don't corrupt state, and a false-completion reply + decline never books", async () => {
    const [t1, t2, t3, t4, t5, t6, t7] = await runScript(
      [
        {
          content: "Sure — which service would you like?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "Sorry, I didn't catch that — which service?", toolCalls: [] },
        { content: "What day and time works for you?", toolCalls: [] },
        { content: "No worries — what day works?", toolCalls: [] },
        { content: "Could I get your name?", toolCalls: [] },
        // Realistic imperfect model behavior: prose claims completion
        // without ever calling request_appointment.
        { content: "Great — I've captured your request, a team member will confirm shortly!", toolCalls: [] },
        { content: "unused — the decline safety net should intercept this", toolCalls: [] },
      ],
      scenarioMessages(3),
    );

    expect(t1.bookingState).toEqual({ intent: "book_appointment" });
    // Garbage doesn't add or corrupt any field.
    expect(t2.bookingState).toEqual({ intent: "book_appointment" });
    expect(t3.bookingState).toEqual({ intent: "book_appointment", service: "Routine cleaning" });
    expect(t4.bookingState).toEqual({ intent: "book_appointment", service: "Routine cleaning" });
    expect(t5.bookingState).toMatchObject({ date: "Tuesday", time: "15:00" });

    expect(t6.bookingState.pendingAction).toBe("confirm_service");
    expect(t6.actionsTaken).toEqual([]);

    // The model never actually proposed a booking action on turn 6, and
    // turn 7's "no" must not book anything despite the model's optimistic
    // (unused) scripted reply — the decline safety net intercepts first.
    expect(t7.actionsTaken).toEqual([]);
    expect(t7.bookingState.pendingAction).toBeUndefined();
    expect(t7.bookingState).toMatchObject({
      service: "Routine cleaning",
      date: "Tuesday",
      time: "15:00",
      name: "Trevor",
      phone: "+12428012847",
    });
  });

  it("4. Date correction: 'actually ... instead' overwrites only date", async () => {
    const [, t2, t3, t4] = await runScript(
      [
        {
          content: "Sure! What day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "Could I get your name?", toolCalls: [] },
        { content: "I have your info — Tuesday 2pm cleaning for Trevor. Shall I book it?", toolCalls: [] },
        {
          content: null,
          toolCalls: [{ id: "c2", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
      ],
      scenarioMessages(4),
    );

    expect(t2.bookingState).toMatchObject({ date: "Tuesday", time: "14:00" });
    expect(t3.bookingState.pendingAction).toBe("confirm_service");

    expect(t4.bookingState).toMatchObject({
      date: "Wednesday",
      time: "14:00", // preserved — correction only targeted date
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    });
  });

  it("5. Time correction: 'actually ... not ...' overwrites only time", async () => {
    const [, t2, t3, t4] = await runScript(
      [
        {
          content: "Sure! What day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "Could I get your name?", toolCalls: [] },
        { content: "I have your info — Tuesday 2pm cleaning for Trevor. Shall I book it?", toolCalls: [] },
        {
          content: null,
          toolCalls: [{ id: "c2", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
      ],
      scenarioMessages(5),
    );

    expect(t2.bookingState).toMatchObject({ date: "Tuesday", time: "14:00" });
    expect(t3.bookingState.pendingAction).toBe("confirm_service");

    expect(t4.bookingState).toMatchObject({
      date: "Tuesday", // preserved — correction only targeted time
      time: "15:00",
      name: "Trevor",
      phone: "+12428012847",
      pendingAction: "confirm_service",
    });
  });

  it("6. FAQ during an active booking doesn't pollute bookingState or advance nextRequiredField", async () => {
    const [t1, t2, t3, t4] = await runScript(
      [
        {
          content: "Sure! What day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "A basic filling is B$175. What day and time works for you?", toolCalls: [] },
        { content: "Could I get your name?", toolCalls: [] },
        {
          content: null,
          toolCalls: [{ id: "c2", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
      ],
      scenarioMessages(6),
    );

    expect(t1.bookingState).toEqual({ intent: "book_appointment", service: "Basic filling" });
    // The FAQ turn must not add date/time/name/phone from unrelated text.
    expect(t2.bookingState).toEqual({ intent: "book_appointment", service: "Basic filling" });
    expect(nextRequiredField(t2.bookingState)).toBe("date");

    expect(t3.bookingState).toMatchObject({ date: "Tuesday", time: "10:00" });
    expect(t4.bookingState.pendingAction).toBe("confirm_service");
  });

  it("7. Unavailable slot offers alternatives; the alternative requires its OWN confirmation, then books correctly", async () => {
    const [, t2, t3, t4, t5] = await runScript(
      [
        {
          content: "Sure! What day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "Could I get your name?", toolCalls: [] },
        {
          content: "Perfect, you're all set for 2pm Tuesday!", // optimistic/wrong — overridden by the availability check
          toolCalls: [
            {
              id: "c2",
              name: "request_appointment",
              argumentsJson: JSON.stringify({
                name: "Trevor",
                phone: "2428012847",
                service: "Routine cleaning",
                preferredDate: "Tuesday",
                preferredTime: "14:00",
              }),
            },
          ],
        },
        {
          content: "Perfect — booking that for you now.", // optimistic/wrong — overridden by Objective 2's hard confirmation gate: no confirmation was pending for 09:00 yet
          toolCalls: [
            {
              id: "c3",
              name: "request_appointment",
              argumentsJson: JSON.stringify({
                name: "Trevor",
                phone: "2428012847",
                service: "Routine cleaning",
                preferredDate: "Tuesday",
                preferredTime: "09:00",
              }),
            },
          ],
        },
        // No 5th scripted reply needed — "yes" (the 5th message) is an
        // unambiguous confirmation of the now-pending 09:00 booking, so
        // the application's auto-confirm bypass (buildAutoConfirmToolCall)
        // completes it without ever consulting the model.
      ],
      scenarioMessages(7),
      HELD_SLOT_BUSINESS,
    );

    expect(t2.bookingState).toMatchObject({ date: "Tuesday", time: "14:00" });

    // The held 14:00 slot is rejected despite the model's proposed action
    // and optimistic reply — time is cleared, date is preserved, and
    // alternatives are offered.
    expect(t3.actionsTaken).toEqual([]);
    expect(t3.reply).toMatch(/already booked/i);
    expect(t3.reply).toMatch(/9:00 AM/);
    expect(t3.bookingState).toMatchObject({ date: "Tuesday", name: "Trevor", phone: "+12428012847" });
    expect(t3.bookingState.time).toBeUndefined();

    // The customer's "9am" is a genuinely available, in-hours correction
    // — but Objective 2's hard gate still blocks the model's attempt to
    // complete it in the SAME turn: no confirmation was pending for
    // 09:00 (only the now-stale 14:00 confirmation was, and that must
    // never authorize a different time). The customer sees a fresh,
    // accurate confirm prompt for 09:00 instead of a completed booking.
    expect(t4.actionsTaken).toEqual([]);
    expect(t4.bookingState.time).toBe("09:00");
    expect(t4.bookingState.pendingAction).toBe("confirm_service");
    expect(t4.reply).toMatch(/reply yes to confirm/i);

    // Only the explicit "yes" actually books it.
    expect(t5.actionsTaken).toEqual([
      {
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "09:00",
          },
        },
        result: { success: true },
      },
    ]);
    expect(t5.bookingState).toEqual({
      bookingJustCompleted: true,
      lastCompletedBooking: {
        intent: "book_appointment",
        service: "Routine cleaning",
        date: "Tuesday",
        time: "09:00",
        name: "Trevor",
        phone: "+12428012847",
      },
    });
  });

  it("8. Out-of-hours time is rejected (clearing both date and time), and a valid retry requires its OWN confirmation before booking", async () => {
    const [, t2, t3, t4, t5] = await runScript(
      [
        {
          content: "Sure! What day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        {
          content: "Booked for 6pm!", // optimistic/wrong — overridden by the hours check
          toolCalls: [
            {
              id: "c2",
              name: "request_appointment",
              argumentsJson: JSON.stringify({
                name: "Trevor",
                phone: "2428012847",
                service: "Basic filling",
                preferredDate: "Tuesday",
                preferredTime: "18:00",
              }),
            },
          ],
        },
        { content: "Could I get your name?", toolCalls: [] },
        {
          content: "Perfect — booking that now.", // optimistic/wrong — overridden by Objective 2's hard confirmation gate: no confirmation was ever pending
          toolCalls: [
            {
              id: "c3",
              name: "request_appointment",
              argumentsJson: JSON.stringify({
                name: "Trevor",
                phone: "2428012847",
                service: "Basic filling",
                preferredDate: "Tuesday",
                preferredTime: "15:00",
              }),
            },
          ],
        },
        // No 5th scripted reply needed — "yes" (the 5th message) is an
        // unambiguous confirmation of the now-pending 15:00 booking, so
        // the application's auto-confirm bypass completes it without
        // ever consulting the model.
      ],
      scenarioMessages(8),
    );

    expect(t2.actionsTaken).toEqual([]);
    expect(t2.reply).toMatch(/outside our hours/i);
    // Both date AND time are cleared on an hours rejection — the customer
    // is asked to restate the whole day/time, not just the time.
    expect(t2.bookingState).toEqual({ intent: "book_appointment", service: "Basic filling" });
    expect(nextRequiredField(t2.bookingState)).toBe("date");

    expect(t3.bookingState).toMatchObject({ date: "Tuesday", time: "15:00" });
    expect(nextRequiredField(t3.bookingState)).toBe("name");

    // Once name+phone complete every required field, the model attempts
    // request_appointment in the SAME turn — but Objective 2's hard gate
    // blocks it: no confirmation was pending BEFORE this turn. The
    // customer sees the confirm-and-summarize prompt instead.
    expect(t4.actionsTaken).toEqual([]);
    expect(t4.bookingState).toMatchObject({ date: "Tuesday", time: "15:00" });
    expect(t4.bookingState.pendingAction).toBe("confirm_service");
    expect(t4.reply).toMatch(/reply yes to confirm/i);

    // Only the explicit "yes" actually books it.
    expect(t5.actionsTaken).toEqual([
      {
        action: {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Basic filling",
            preferredDate: "Tuesday",
            preferredTime: "15:00",
          },
        },
        result: { success: true },
      },
    ]);
    expect(t5.bookingState).toEqual({
      bookingJustCompleted: true,
      lastCompletedBooking: {
        intent: "book_appointment",
        service: "Basic filling",
        date: "Tuesday",
        time: "15:00",
        name: "Trevor",
        phone: "+12428012847",
      },
    });
  });

  it("9. Escalation: handoff activates, state clears, and no booking action is taken", async () => {
    const [t1, t2] = await runScript(
      [
        {
          content: "Sure! What day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        {
          content: null,
          toolCalls: [
            { id: "c2", name: "escalate", argumentsJson: JSON.stringify({ reason: "customer requested a person" }) },
          ],
        },
      ],
      scenarioMessages(9),
    );

    expect(t1.bookingState).toEqual({ intent: "book_appointment", service: "Routine cleaning" });
    expect(t1.handoffActive).toBe(false);

    expect(t2.actionsTaken).toEqual([
      { action: { type: "escalate", payload: { reason: "customer requested a person" } }, result: { success: true } },
    ]);
    expect(t2.handoffActive).toBe(true);
    expect(t2.bookingState).toEqual({});
  });

  it("10. Messy conversation with interruptions: FAQ/out-of-order info survive, but a known name-extraction limit degrades safely", async () => {
    const [t1, t2, t3, t4, t5, t6] = await runScript(
      [
        { content: "Happy to help! Which service would you like — a routine cleaning?", toolCalls: [] },
        {
          content: "Great — what day and time works for you?",
          toolCalls: [{ id: "c1", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "A routine cleaning is B$125. What day and time works for you?", toolCalls: [] },
        { content: "Could I get your name?", toolCalls: [] },
        {
          content: null,
          toolCalls: [{ id: "c2", name: "update_booking_progress", argumentsJson: updateIntent() }],
        },
        { content: "unused", toolCalls: [] },
      ],
      scenarioMessages(10),
    );

    expect(t1.bookingState).toEqual({});
    expect(t2.bookingState).toEqual({ service: "Routine cleaning", intent: "book_appointment" });
    // The FAQ interruption doesn't touch bookingState.
    expect(t3.bookingState).toEqual({ service: "Routine cleaning", intent: "book_appointment" });
    expect(t4.bookingState).toMatchObject({ date: "Tuesday", time: "14:00" });

    // KNOWN, DOCUMENTED LIMITATION: extractStatedFields' bare-name fallback
    // caps candidates at 3 words (looksLikeName) to avoid false-positive
    // name capture elsewhere. "its trevor, my numbers 2428012847" strips
    // down to "its trevor my numbers" (4 words after the phone digits are
    // removed) and is rejected — phone is still captured correctly, but
    // name is not. This is a SAFE degradation (the app just re-asks for
    // the name; it never fabricates or corrupts data) rather than a false
    // positive, so it's asserted here explicitly rather than hidden.
    expect(t5.bookingState).toEqual({
      service: "Routine cleaning",
      intent: "book_appointment",
      date: "Tuesday",
      time: "14:00",
      phone: "+12428012847",
    });
    expect(nextRequiredField(t5.bookingState)).toBe("name");
    expect(t5.reply).toMatch(/name/i);

    // Consequently "yes" has no pendingAction to confirm and correctly
    // does not book anything.
    expect(t6.bookingState.pendingAction).toBeUndefined();
    expect(t6.actionsTaken).toEqual([]);
  });
});
