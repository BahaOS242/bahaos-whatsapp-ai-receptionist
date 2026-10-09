/**
 * Outbound-messaging boundary — the abstraction ReceptionistAgent's
 * caller (the WhatsApp webhook route, scripts/dev-chat.ts, tests) sends
 * a reply through, exactly parallel to how ReceptionistTools already
 * abstracts booking persistence across three interchangeable
 * implementations. ReceptionistAgent itself never sends a message and
 * never imports anything from this module — it only ever returns
 * `reply`/`actionsTaken` and lets its caller decide what to do with
 * them (see receptionist-agent.ts's own docstring). WhatsApp API calls
 * belong ONLY in src/messaging/whatsapp-messaging-provider.ts, never
 * inlined into the agent, the webhook route, or anywhere else — the
 * same "one real implementation behind a narrow interface" discipline
 * this codebase already applies to booking tools.
 */
export interface OutboundMessageResult {
  success: boolean;
  /** The provider's own id for the sent message (e.g. WhatsApp's
   * `messages[0].id`, a "wamid...." string) — useful for later
   * correlating delivery-status webhooks, never required for anything
   * this milestone builds. Absent on failure. */
  providerMessageId?: string;
  /** Human-readable failure reason — never a raw provider secret/token,
   * never logged with credentials attached. Absent on success. */
  error?: string;
  /** Only meaningful when `success` is false — see
   * src/messaging/outbound-retry-worker.ts's docstring for the full
   * classification this drives. `true` for a failure another attempt
   * COULD plausibly fix (a network blip, a 5xx/429 from the provider);
   * `false` for a failure retrying will only ever reproduce identically
   * (a rejected/invalid recipient, an auth failure, a malformed
   * request). Absent (treated as non-retryable) for a provider
   * implementation that hasn't been taught to classify its own
   * failures — the SAFE default, since retrying a genuinely permanent
   * failure wastes attempts for no benefit, while never retrying a
   * genuinely transient one merely delays (not loses) the message,
   * caught by the next real send attempt anyway. */
  retryable?: boolean;
  /** Stable, machine-readable classification of a failure for the outbox
   * (never a secret): "network_timeout" | "network_error" |
   * `http_<status>` | `meta_<code>`. The retry DECISION is still driven
   * solely by `retryable` above — this is for inspection, not a second
   * taxonomy. */
  errorCode?: string;
  /** True when the request may nonetheless have been ACCEPTED by the
   * provider (a timeout or dropped connection after the request left
   * us). A retry of an ambiguous failure can therefore duplicate a
   * message the customer already received — the WhatsApp Cloud API has
   * no idempotency key to prevent that, so the outbox records it. */
  ambiguous?: boolean;
  /** Provider HTTP status / Meta error code when known (diagnostics). */
  httpStatus?: number;
  metaCode?: number;
}

export interface MessagingProvider {
  /** Sends one plain-text message to `to` (a phone number in whatever
   * shape the concrete provider expects — the WhatsApp implementation
   * expects digits-only, no leading "+", matching Meta's own `wa_id`
   * shape). Never throws for an ordinary provider-side failure (a bad
   * token, a rate limit, a network error) — those come back as
   * `{success:false, error}` so a caller (the webhook route) can decide
   * how to react (log it, mark the outbound message record "failed",
   * still return 200 to Meta) without an uncaught rejection taking down
   * the request. A thrown error here means something genuinely
   * unexpected (a programming error), not a normal delivery failure. */
  sendText(to: string, body: string): Promise<OutboundMessageResult>;
}
