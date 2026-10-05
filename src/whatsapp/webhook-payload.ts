/**
 * The ONE place in this codebase that knows the shape of a Meta WhatsApp
 * Cloud API webhook payload. Nothing downstream of parseWebhookPayload
 * (ReceptionistAgent, PersistedConversationManager, the webhook route's
 * own control flow) ever sees a raw `entry`/`changes`/`value` object —
 * see NormalizedInboundMessage, the clean internal shape everything else
 * is written against. This is the "adapter/boundary" the mission
 * explicitly requires so provider-specific structure never leaks into
 * the receptionist engine.
 *
 * Deliberately permissive/defensive throughout: a real webhook payload
 * is attacker-reachable (anyone can POST to a public URL even before
 * signature verification rejects it) and Meta's own delivery can be
 * malformed in ways that don't matter to know in advance — every access
 * into the untyped body uses optional chaining and a runtime shape
 * check, and any entry that doesn't look like a real message is simply
 * skipped, never thrown. "Malformed webhook payloads must not crash the
 * application" is enforced HERE, not by a try/catch at the route level.
 */

export interface NormalizedInboundMessage {
  /** Meta's own message id (a "wamid...." string) — the idempotency key
   * every downstream duplicate-delivery check is keyed on (see
   * src/db/messages.ts's messages_whatsapp_message_id_key). */
  whatsappMessageId: string;
  /** The customer's WhatsApp id (digits only, no "+") — what
   * resolveCustomer treats as the durable customer identity. */
  from: string;
  /** When Meta says the message was sent — informational only; nothing
   * in this codebase currently branches on it, but it's real data worth
   * carrying through rather than discarding. */
  timestamp: Date;
  /** The business phone number that RECEIVED this message — Phase 11's
   * "tenant/business-number validation" hook: a caller can check this
   * against the configured WHATSAPP_PHONE_NUMBER_ID before processing,
   * rather than trusting every inbound payload's claimed destination. */
  phoneNumberId: string | undefined;
  /** The business number's human-readable display form (e.g.
   * "+1 650-555-1234"), from the SAME `metadata` object as
   * `phoneNumberId` — never used for any validation/routing decision
   * (phoneNumberId is the stable identifier for that), purely to make a
   * phone-number-id-mismatch log line actually readable by an operator
   * instead of two opaque numeric ids. */
  displayPhoneNumber: string | undefined;
  /** The customer's own display name, if WhatsApp supplied one via the
   * payload's `contacts[].profile.name` — used only to pre-fill a NEW
   * customer record's displayName (see resolveCustomer), never trusted
   * over anything the customer states in-conversation. */
  profileName: string | undefined;
  /** Present only for `type: "text"` messages. */
  text: string | undefined;
  /** Set (to Meta's own `type` value, e.g. "image", "audio", "location",
   * "interactive", "unsupported") whenever this message is NOT plain
   * text — the caller must route these through a safe fallback/
   * escalation reply rather than attempting to extract booking fields
   * from them (see Phase 3's "unsupported message types" requirement).
   * Mutually exclusive with `text`. */
  unsupportedType: string | undefined;
}

/** Meta delivers delivery-status updates (sent/delivered/read/failed)
 * through the SAME webhook, under `value.statuses` rather than
 * `value.messages` — these are not customer messages at all and must be
 * silently accepted (200 OK, nothing to process), never misrouted into
 * "unsupported message type" handling (which would incorrectly create
 * an escalation/reply for something that was never a conversation
 * turn). parseWebhookPayload already only ever reads `value.messages`,
 * so a payload containing only `value.statuses` naturally yields `[]` —
 * this type exists purely to document that this is an intentional,
 * checked case, not an oversight. */
export type WebhookChangeValue = {
  metadata?: { phone_number_id?: unknown; display_phone_number?: unknown };
  contacts?: { profile?: { name?: unknown } }[];
  messages?: unknown[];
  statuses?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Meta sends `timestamp` as a string of unix SECONDS (not
 * milliseconds) — e.g. "1690000000". Falls back to "now" for a missing
 * or unparseable value rather than producing an Invalid Date, since
 * nothing downstream currently treats this as safety-critical. */
function parseTimestamp(value: unknown): Date {
  const raw = asString(value);
  if (!raw) return new Date();
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds)) return new Date();
  return new Date(seconds * 1000);
}

function normalizeOneMessage(
  rawMessage: unknown,
  phoneNumberId: string | undefined,
  displayPhoneNumber: string | undefined,
  profileName: string | undefined,
): NormalizedInboundMessage | undefined {
  if (!isRecord(rawMessage)) return undefined;
  const whatsappMessageId = asString(rawMessage.id);
  const from = asString(rawMessage.from);
  const type = asString(rawMessage.type);
  if (!whatsappMessageId || !from || !type) return undefined; // not a real message — skip, never throw

  const timestamp = parseTimestamp(rawMessage.timestamp);
  const base = { whatsappMessageId, from, timestamp, phoneNumberId, displayPhoneNumber, profileName };

  if (type === "text") {
    const text = isRecord(rawMessage.text) ? asString(rawMessage.text.body) : undefined;
    // A "text"-typed message with no readable body is itself malformed
    // enough to be worth treating as unsupported rather than silently
    // dropping — the customer DID send something, and staying silent is
    // exactly the "swallow it" behavior Phase 3 rules out.
    if (!text) {
      return { ...base, text: undefined, unsupportedType: "text" };
    }
    return { ...base, text, unsupportedType: undefined };
  }

  return { ...base, text: undefined, unsupportedType: type };
}

/**
 * Parses a full webhook POST body (Meta's `{object, entry: [...]}`
 * top-level shape) into zero or more NormalizedInboundMessage — one per
 * actual customer message across every entry/change/message Meta batched
 * into this single delivery (a real webhook payload can legitimately
 * carry more than one). Returns `[]` for anything that doesn't look like
 * a real WhatsApp messages payload (wrong shape, missing fields, a pure
 * status-update payload, a request body that isn't even an object) —
 * NEVER throws. The caller is expected to always respond 200 to Meta
 * regardless of what this returns, per Meta's own webhook contract.
 */
export function parseWebhookPayload(body: unknown): NormalizedInboundMessage[] {
  if (!isRecord(body)) return [];
  const entries = Array.isArray(body.entry) ? body.entry : [];

  const results: NormalizedInboundMessage[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!isRecord(change)) continue;
      const value = change.value;
      if (!isRecord(value)) continue;
      const phoneNumberId = isRecord(value.metadata) ? asString(value.metadata.phone_number_id) : undefined;
      const displayPhoneNumber = isRecord(value.metadata) ? asString(value.metadata.display_phone_number) : undefined;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const profileName =
        isRecord(contacts[0]) && isRecord(contacts[0].profile) ? asString(contacts[0].profile.name) : undefined;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const rawMessage of messages) {
        const normalized = normalizeOneMessage(rawMessage, phoneNumberId, displayPhoneNumber, profileName);
        if (normalized) results.push(normalized);
      }
      // value.statuses (delivery receipts) is intentionally never read
      // here — see WebhookChangeValue's docstring.
    }
  }
  return results;
}

/** Meta's GET verification challenge query params — `hub.mode`,
 * `hub.verify_token`, `hub.challenge`. Express parses dotted query keys
 * as literal string keys (not nested objects), so this reads them
 * exactly as Meta sends them. */
export interface WebhookVerificationQuery {
  mode: string | undefined;
  verifyToken: string | undefined;
  challenge: string | undefined;
}

export function parseVerificationQuery(query: Record<string, unknown>): WebhookVerificationQuery {
  return {
    mode: asString(query["hub.mode"]),
    verifyToken: asString(query["hub.verify_token"]),
    challenge: asString(query["hub.challenge"]),
  };
}
