import { describe, expect, it } from "vitest";
import { parseWebhookPayload, parseWebhookStatuses } from "../../src/whatsapp/webhook-payload";

/** Shapes captured from the real Meta test number on 2026-10-09 (ids shortened, numbers made up). */
const envelope = (value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15556436134", phone_number_id: "PNID1" }, ...value } }] }],
});

const failed = {
  id: "wamid.FAILED1",
  status: "failed",
  timestamp: "1791569332",
  recipient_id: "12425550100",
  errors: [{ code: 131031, title: "Business Account locked", message: "Business Account locked", error_data: { details: "Business account has been locked." } }],
};

describe("parseWebhookStatuses", () => {
  it("parses a failed receipt with its Meta error, never mistaking it for a customer message", () => {
    const body = envelope({ statuses: [failed] });
    expect(parseWebhookPayload(body)).toEqual([]);
    expect(parseWebhookStatuses(body)).toEqual([
      {
        providerMessageId: "wamid.FAILED1",
        status: "failed",
        eventAt: new Date(1791569332 * 1000),
        recipient: "12425550100",
        errorCode: "meta_131031",
        errorTitle: "Business Account locked",
        phoneNumberId: "PNID1",
      },
    ]);
  });

  it("parses sent / delivered / read, several per delivery, across entries", () => {
    const body = envelope({
      statuses: [
        { id: "wamid.A", status: "sent", timestamp: "100", recipient_id: "1" },
        { id: "wamid.A", status: "delivered", timestamp: "101", recipient_id: "1" },
        { id: "wamid.A", status: "read", timestamp: "102", recipient_id: "1" },
      ],
    });
    expect(parseWebhookStatuses(body).map((r) => r.status)).toEqual(["sent", "delivered", "read"]);
    expect(parseWebhookStatuses(body).every((r) => r.errorCode === undefined)).toBe(true);
  });

  it("ignores unknown statuses, missing ids and garbage without throwing", () => {
    expect(parseWebhookStatuses(envelope({ statuses: [{ id: "wamid.A", status: "deleted", timestamp: "1" }] }))).toEqual([]);
    expect(parseWebhookStatuses(envelope({ statuses: [{ status: "read", timestamp: "1" }] }))).toEqual([]);
    expect(parseWebhookStatuses(envelope({ statuses: [null, 7, "x", {}] }))).toEqual([]);
    expect(parseWebhookStatuses(null)).toEqual([]);
    expect(parseWebhookStatuses({ entry: "nope" })).toEqual([]);
    expect(parseWebhookStatuses(envelope({}))).toEqual([]);
  });

  it("a missing or invalid timestamp is deterministic (epoch), so a duplicate still dedupes", () => {
    const a = parseWebhookStatuses(envelope({ statuses: [{ id: "wamid.A", status: "delivered" }] }));
    const b = parseWebhookStatuses(envelope({ statuses: [{ id: "wamid.A", status: "delivered", timestamp: "abc" }] }));
    expect(a[0].eventAt.getTime()).toBe(0);
    expect(b[0].eventAt.getTime()).toBe(0);
  });

  it("a message and a status in the same delivery are each parsed by their own function", () => {
    const body = envelope({
      contacts: [{ profile: { name: "T" }, wa_id: "1" }],
      messages: [{ from: "1", id: "wamid.IN1", timestamp: "5", type: "text", text: { body: "hi" } }],
      statuses: [{ id: "wamid.A", status: "delivered", timestamp: "6" }],
    });
    expect(parseWebhookPayload(body)).toHaveLength(1);
    expect(parseWebhookStatuses(body)).toHaveLength(1);
  });
});
