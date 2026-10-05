import { describe, expect, it } from "vitest";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { ConversationTurn } from "../../src/ai/types";

/**
 * Regression coverage for the reported bug: after "Trevor 12428012847",
 * the agent kept re-asking "Could I get your name and phone number?"
 * forever. Root cause was re-deriving everything from conversation prose
 * on every turn instead of maintaining real state — see
 * ConversationManager / DevRuleBasedAIProvider for the fix.
 */
describe("Booking state regression — exact reported conversation", () => {
  it("completes the booking without ever re-asking for information already given", async () => {
    const provider = new DevRuleBasedAIProvider();
    const conversationManager = new ConversationManager();
    const history: ConversationTurn[] = [];
    const transcript: string[] = [];

    async function turn(message: string) {
      const req = conversationManager.buildRequest({
        business: BAHAMAS_DENTAL_SERVICE,
        customer: {},
        history,
        message,
      });
      const result = await provider.generateResponse(req);
      transcript.push(`You: ${message}`, `AI: ${result.reply}`);
      history.push(
        { role: "customer", content: message },
        { role: "assistant", content: result.reply },
      );
      conversationManager.setBookingState(result.bookingState);
      return result;
    }

    await turn("I want to book an appointment"); // 1. user requests booking
    const afterService = await turn("filling"); // 2. user selects filling
    expect(afterService.bookingState.service).toBe("Basic filling");

    const afterDateTime = await turn("Tuesday 2pm"); // 3. user gives date/time (within hours)
    expect(afterDateTime.bookingState.date).toBe("Tuesday");
    expect(afterDateTime.bookingState.time).toBe("14:00");

    // 4. user gives name + phone in ONE message
    const confirming = await turn("Trevor 12428012847");

    // 5/6. system persisted both and did not ask again
    expect(confirming.reply).not.toMatch(/could i get your name/i);
    expect(confirming.reply).not.toMatch(/what day|what time/i);

    // Objective 2's hard gate: every field being known now presents a
    // confirm-and-summarize prompt, not an immediate booking.
    expect(confirming.actions).toEqual([]);
    expect(confirming.reply).toMatch(/reply yes to confirm/i);

    // 7. booking proceeds to the next required action once confirmed
    const final = await turn("yes");
    expect(final.actions).toEqual([
      {
        type: "request_appointment",
        payload: {
          name: "Trevor",
          phone: "+12428012847",
          service: "Basic filling",
          preferredDate: "Tuesday",
          preferredTime: "14:00",
        },
      },
    ]);

    expect(transcript.join("\n")).not.toMatch(
      /(Could I get your name and phone number\?[\s\S]*){2,}/,
    );
  });
});

describe("Booking state regression — phone number variants normalize identically", () => {
  const cases: [string, string][] = [
    ["Trevor 12428012847", "+12428012847"],
    ["Trevor, +1 242 801 2847", "+12428012847"],
    ["Trevor 8012847", "+12428012847"], // 7-digit local number, Bahamas area code assumed
  ];

  for (const [message, expectedPhone] of cases) {
    it(`"${message}" normalizes to ${expectedPhone}`, async () => {
      const provider = new DevRuleBasedAIProvider();
      const state = {
        intent: "book_appointment" as const,
        service: "Basic filling",
        date: "Tuesday",
        time: "14:00",
      };

      const confirming = await provider.generateResponse({
        business: BAHAMAS_DENTAL_SERVICE,
        customer: {},
        history: [],
        message,
        bookingState: state,
      });
      expect(confirming.bookingState.pendingAction).toBe("confirm_booking");

      const result = await provider.generateResponse({
        business: BAHAMAS_DENTAL_SERVICE,
        customer: {},
        history: [],
        message: "yes",
        bookingState: confirming.bookingState,
      });

      expect(result.actions).toEqual([
        expect.objectContaining({
          type: "request_appointment",
          payload: expect.objectContaining({ name: "Trevor", phone: expectedPhone }),
        }),
      ]);
    });
  }
});

describe("Booking state regression — partial information asks only for what's missing", () => {
  const baseState = {
    intent: "book_appointment" as const,
    service: "Basic filling",
    date: "Tuesday",
    time: "14:00",
  };

  it('"Trevor" alone → asks only for phone, not name again', async () => {
    const provider = new DevRuleBasedAIProvider();
    const result = await provider.generateResponse({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history: [],
      message: "Trevor",
      bookingState: baseState,
    });

    expect(result.bookingState.name).toBe("Trevor");
    expect(result.bookingState.phone).toBeUndefined();
    expect(result.reply).toMatch(/phone number/i);
    expect(result.reply).not.toMatch(/your name/i);
  });

  it('"+1 242 801 2847" alone → asks only for name, not phone again', async () => {
    const provider = new DevRuleBasedAIProvider();
    const result = await provider.generateResponse({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: {},
      history: [],
      message: "+1 242 801 2847",
      bookingState: baseState,
    });

    expect(result.bookingState.phone).toBe("+12428012847");
    expect(result.bookingState.name).toBeUndefined();
    expect(result.reply).toMatch(/your name/i);
    expect(result.reply).not.toMatch(/phone number/i);
  });
});
