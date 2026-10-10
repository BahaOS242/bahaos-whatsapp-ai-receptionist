import { describe, expect, it } from "vitest";
import { devConversation, llmConversation, type TortureConversation } from "../torture/helpers";
import { pinClockToReferenceCalendar } from "../helpers/pin-clock";

/**
 * Reported by Codex at e5bef4d (fallback AND scripted-LLM): after cleaning / Tuesday 2pm / Trevor / a valid phone,
 * "Tuesday I am off that day so that works" CLEARED Tuesday and lost confirmation readiness. Cause: "off that day"
 * was on the rejection list. Being OFF WORK / free is AVAILABILITY; only "can't / won't work / busy" is rejection.
 * LANES: dev-rule-based fallback and scripted-LLM (adds nothing; the app's own extraction drives); simulated tools.
 */
pinClockToReferenceCalendar();
const ok = { content: "Got it.", toolCalls: [] as never[] };
const bookings = (c: TortureConversation) =>
  c.turns
    .flatMap((t) => t.actionsTaken)
    .filter((a) => a.action.type === "request_appointment" && a.result.success);

async function ready(lane: "dev" | "llm") {
  const c = lane === "dev" ? devConversation() : llmConversation([ok]).conversation;
  await c.sayAll(
    lane === "dev"
      ? ["I need a cleaning", "yes", "Tuesday 2pm", "Trevor 2428012847"]
      : ["I want a cleaning", "Tuesday 2pm", "Trevor 2428012847"],
  );
  const armed = lane === "dev" ? "confirm_booking" : "confirm_service";
  expect(c.last.bookingState).toMatchObject({
    date: "Tuesday",
    time: "14:00",
    name: "Trevor",
    phone: "+12428012847",
    pendingAction: armed,
  });
  return { c, armed };
}

describe.each(["dev", "llm"] as const)(
  "availability keeps the day and the confirmation (%s lane)",
  (lane) => {
    it.each([
      "Tuesday I am off that day so that works",
      "I'm off work on Tuesday",
      "Tuesday is my day off",
      "I'm free Tuesday",
      "Tuesday works for me, I'm off",
    ])("%j", async (message) => {
      const { c, armed } = await ready(lane);
      const t = await c.say(message);
      expect(t.bookingState).toMatchObject({
        date: "Tuesday",
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
        pendingAction: armed,
      });
      expect(bookings(c)).toHaveLength(0); // this message is availability, not a separate approval of the summary
      await c.say("yes");
      expect(bookings(c)).toHaveLength(1);
      expect(bookings(c)[0].action.payload).toMatchObject({
        preferredDate: "Tuesday",
        preferredTime: "14:00",
        name: "Trevor",
      });
      await c.say("yes");
      expect(bookings(c)).toHaveLength(1);
    });
  },
);

describe.each(["dev", "llm"] as const)(
  "rejection clears only the rejected day and invalidates the approval (%s lane)",
  (lane) => {
    it.each([
      "Tuesday won't work",
      "I can't do Tuesday",
      "I'm busy on Tuesday",
      "Tuesday doesn't work for me",
      "Tuesday is not good for me",
      "I work Tuesday",
    ])("%j", async (message) => {
      const { c } = await ready(lane);
      const t = await c.say(message);
      expect(t.bookingState.date).toBeUndefined();
      expect(t.bookingState).toMatchObject({
        time: "14:00",
        name: "Trevor",
        phone: "+12428012847",
        service: "Routine cleaning",
      });
      expect(t.bookingState.pendingAction).toBeUndefined();
      await c.say("yes");
      expect(bookings(c)).toHaveLength(0);
      const w = await c.say("Wednesday");
      expect(w.bookingState).toMatchObject({ date: "Wednesday", time: "14:00" });
      await c.say("yes");
      expect(bookings(c)).toHaveLength(1);
      expect(bookings(c)[0].action.payload).toMatchObject({
        preferredDate: "Wednesday",
        preferredTime: "14:00",
        name: "Trevor",
      });
    });
  },
);

describe("an ambiguous 'off' gets a clarifying question, never a guess (dev lane)", () => {
  it("'tuesaday i off that day' keeps every detail, drops the old approval, asks, and still needs a fresh yes", async () => {
    const { c } = await ready("dev");
    const t = await c.say("tuesaday i off that day");
    expect(t.bookingState).toMatchObject({
      date: "Tuesday",
      time: "14:00",
      name: "Trevor",
      phone: "+12428012847",
    });
    expect(t.bookingState.pendingAction).toBeUndefined();
    expect(t.reply).toMatch(/does Tuesday work|different day/i);
    expect(bookings(c)).toHaveLength(0);
    const y1 = await c.say("yes"); // answers the clarification
    expect(bookings(c)).toHaveLength(0);
    expect(y1.bookingState.pendingAction).toBe("confirm_booking");
    await c.say("yes");
    expect(bookings(c)).toHaveLength(1);
  });
});
