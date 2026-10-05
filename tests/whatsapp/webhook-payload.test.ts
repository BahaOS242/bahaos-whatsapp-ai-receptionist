import { describe, expect, it } from "vitest";
import { parseVerificationQuery, parseWebhookPayload } from "../../src/whatsapp/webhook-payload";

/** A minimal, realistic Meta WhatsApp Cloud API text-message payload —
 * shape taken from Meta's own published webhook documentation. */
function textPayload(overrides: Partial<{ from: string; id: string; timestamp: string; body: string; phoneNumberId: string; profileName: string }> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "12428010000", phone_number_id: overrides.phoneNumberId ?? "PHONE_ID_1" },
              contacts: [{ profile: { name: overrides.profileName ?? "Trevor" }, wa_id: overrides.from ?? "12428012847" }],
              messages: [
                {
                  from: overrides.from ?? "12428012847",
                  id: overrides.id ?? "wamid.ABC123",
                  timestamp: overrides.timestamp ?? "1700000000",
                  type: "text",
                  text: { body: overrides.body ?? "book a cleaning" },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

describe("parseWebhookPayload — text messages", () => {
  it("normalizes a real-shaped text message payload", () => {
    const [message] = parseWebhookPayload(textPayload());

    expect(message).toBeDefined();
    expect(message.whatsappMessageId).toBe("wamid.ABC123");
    expect(message.from).toBe("12428012847");
    expect(message.text).toBe("book a cleaning");
    expect(message.unsupportedType).toBeUndefined();
    expect(message.phoneNumberId).toBe("PHONE_ID_1");
    expect(message.displayPhoneNumber).toBe("12428010000");
    expect(message.profileName).toBe("Trevor");
    expect(message.timestamp).toBeInstanceOf(Date);
    expect(message.timestamp.getTime()).toBe(1700000000 * 1000);
  });

  it("normalizes multiple messages across multiple entries/changes in one delivery", () => {
    const payload = textPayload({ id: "wamid.FIRST", from: "12428012847" });
    const second = textPayload({ id: "wamid.SECOND", from: "12428019999", body: "hi" });
    payload.entry.push(second.entry[0]);

    const messages = parseWebhookPayload(payload);

    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.whatsappMessageId)).toEqual(["wamid.FIRST", "wamid.SECOND"]);
  });
});

describe("parseWebhookPayload — unsupported message types", () => {
  it("marks a non-text message type as unsupported rather than dropping or crashing", () => {
    const payload = textPayload();
    payload.entry[0].changes[0].value.messages[0] = {
      from: "12428012847",
      id: "wamid.IMG1",
      timestamp: "1700000000",
      type: "image",
      // @ts-expect-error — fixture intentionally omits `text` for an image message
      image: { id: "media-id-123", mime_type: "image/jpeg" },
    };

    const [message] = parseWebhookPayload(payload);

    expect(message.unsupportedType).toBe("image");
    expect(message.text).toBeUndefined();
    expect(message.whatsappMessageId).toBe("wamid.IMG1");
  });

  it("normalizes a reaction (emoji tap on a previous message) with unsupportedType='reaction' — real Meta shape", () => {
    const payload = textPayload();
    payload.entry[0].changes[0].value.messages[0] = {
      from: "12428012847",
      id: "wamid.REACT1",
      timestamp: "1700000000",
      type: "reaction",
      // @ts-expect-error — fixture uses Meta's real reaction shape, not the base text-message type
      reaction: { message_id: "wamid.ORIGINAL", emoji: "👍" },
    };

    const [message] = parseWebhookPayload(payload);

    expect(message.unsupportedType).toBe("reaction");
    expect(message.text).toBeUndefined();
  });

  it("treats a 'text'-typed message with no readable body as unsupported rather than silently dropping it", () => {
    const payload = textPayload();
    payload.entry[0].changes[0].value.messages[0] = {
      from: "12428012847",
      id: "wamid.EMPTY",
      timestamp: "1700000000",
      type: "text",
      // @ts-expect-error — fixture intentionally omits `text.body`
      text: {},
    };

    const [message] = parseWebhookPayload(payload);

    expect(message.unsupportedType).toBe("text");
    expect(message.text).toBeUndefined();
  });
});

describe("parseWebhookPayload — delivery-status updates are silently ignored, never miscategorized", () => {
  it("a payload containing only `value.statuses` (no `value.messages`) yields no normalized messages", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "PHONE_ID_1" },
                statuses: [{ id: "wamid.ABC123", status: "delivered", timestamp: "1700000000" }],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    expect(parseWebhookPayload(payload)).toEqual([]);
  });
});

describe("parseWebhookPayload — malformed payloads never throw", () => {
  it.each([
    [null],
    [undefined],
    ["a plain string"],
    [42],
    [[]],
    [{}],
    [{ entry: "not an array" }],
    [{ entry: [null] }],
    [{ entry: [{ changes: "not an array" }] }],
    [{ entry: [{ changes: [{ value: null }] }] }],
    [{ entry: [{ changes: [{ value: { messages: "not an array" } }] }] }],
    [{ entry: [{ changes: [{ value: { messages: [null, 42, "x", {}] } }] }] }],
    [{ entry: [{ changes: [{ value: { messages: [{ from: "123" }] } }] }] }], // missing id/type
  ])("returns [] for malformed input %#", (body) => {
    expect(() => parseWebhookPayload(body)).not.toThrow();
    expect(parseWebhookPayload(body)).toEqual([]);
  });
});

describe("parseVerificationQuery", () => {
  it("extracts hub.mode/hub.verify_token/hub.challenge", () => {
    const result = parseVerificationQuery({
      "hub.mode": "subscribe",
      "hub.verify_token": "secret123",
      "hub.challenge": "challenge-abc",
    });

    expect(result).toEqual({ mode: "subscribe", verifyToken: "secret123", challenge: "challenge-abc" });
  });

  it("returns undefined fields for a query missing them, never throws", () => {
    expect(parseVerificationQuery({})).toEqual({ mode: undefined, verifyToken: undefined, challenge: undefined });
  });
});
