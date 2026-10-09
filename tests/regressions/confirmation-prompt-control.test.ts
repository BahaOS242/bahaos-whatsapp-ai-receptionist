import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { llmConversation, type TortureConversation } from "../torture/helpers";
import { looksLikeConfirmationPrompt } from "../../src/ai/booking-confirmation";

/**
 * Regression for the staging finding: with the NAME missing, the model wrote "I have you down… Reply YES to confirm"
 * itself. The app (correctly) would not book on "yes", but the customer had been invited to confirm something the app
 * had not armed. A customer may only be invited to confirm by the APP's own prompt for exactly the stored values.
 *
 * LANE: SCRIPTED LLM client (adversarial fake model) + SIMULATED tools. Clock frozen at 2026-10-09T16:00Z (Fri noon, Nassau).
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") }); });
afterEach(() => { vi.useRealTimers(); });

const ok = { content: "Got it.", toolCalls: [] as never[] };
const says = (content: string) => ({ content, toolCalls: [] as never[] });
const FAKE = "I have you down for Routine cleaning on Tuesday, October 13 at 2:00 PM. Reply YES to confirm the booking.";
const bookings = (c: TortureConversation) => c.turns.flatMap((t) => t.actionsTaken).filter((a) => a.action.type === "request_appointment");

describe("detector", () => {
  it.each([
    "Reply YES to confirm the booking.",
    "reply yes to confirm",
    "I have you down for a cleaning on Tuesday.",
    "Please confirm the booking and we're done.",
    "Shall I go ahead and book that?",
  ])("recognises %j", (t) => expect(looksLikeConfirmationPrompt(t)).toBe(true));
  it.each([
    "We'll confirm your appointment by email.",
    "Could you confirm your phone number?",
    "Please confirm your name.",
    "A cleaning takes about 45 minutes.",
    "We are open Monday to Friday, 9 AM to 5 PM.",
    "Could I get your name?",
    "Got it.",
  ])("leaves %j alone", (t) => expect(looksLikeConfirmationPrompt(t)).toBe(false));
});

describe("the model cannot invite a confirmation the app has not armed", () => {
  it("name missing: the fake summary is replaced by the app's next question; 'yes' books nothing", async () => {
    const { conversation: c } = llmConversation([ok, ok, ok, says(FAKE), says(FAKE)]);
    await c.sayAll(["I want a cleaning", "Tuesday 2pm", "2428012847"]);
    const t = await c.say("ok thanks");
    expect(t.reply).toBe("Could I get your name?");
    expect(t.reply).not.toMatch(/reply yes|confirm|I have you down/i);
    expect(t.bookingState.name).toBeUndefined();
    expect(t.bookingState.pendingAction).toBeUndefined();
    const y = await c.say("yes");
    expect(y.reply).toBe("Could I get your name?");
    expect(bookings(c)).toHaveLength(0);
  });

  it("armed: a wrong model summary is replaced by the app's summary of the STORED values; only a separate yes books those", async () => {
    const wrong = "Sure! I have you down for Routine cleaning on Wednesday, October 14 at 3:00 PM. Reply YES to confirm the booking.";
    const { conversation: c } = llmConversation([ok, ok, ok, ok, says(wrong)]);
    await c.sayAll(["I want a cleaning", "Tuesday 2pm", "2428012847", "My name is Trevor"]);
    expect(c.last.bookingState.pendingAction).toBe("confirm_service");
    expect(c.last.reply).toMatch(/Tuesday.*2:00 PM/);
    const t = await c.say("hmm let me think");
    expect(t.reply).toMatch(/Tuesday.*2:00 PM/);
    expect(t.reply).not.toMatch(/Wednesday|3:00 PM/);
    expect(t.bookingState).toMatchObject({ date: "Tuesday", time: "14:00", name: "Trevor" });
    expect(bookings(c)).toHaveLength(0);
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
    expect(bookings(c)[0].action.payload).toMatchObject({ name: "Trevor", preferredTime: "14:00", preferredDate: "Tuesday" });
  });

  it("ordinary model answers that merely mention 'confirm' are untouched", async () => {
    const { conversation: c } = llmConversation([says("We'll confirm your appointment by email once it's booked."), says("Could you confirm your phone number?")]);
    const a = await c.say("how will I know it's booked?");
    expect(a.reply).toBe("We'll confirm your appointment by email once it's booked.");
    const b = await c.say("what do you need from me?");
    expect(b.reply).toBe("Could you confirm your phone number?");
  });
});
