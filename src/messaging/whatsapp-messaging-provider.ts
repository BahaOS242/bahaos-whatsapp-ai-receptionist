import type { MessagingProvider, OutboundMessageResult } from "./messaging-provider";

/**
 * Real Meta WhatsApp Cloud API outbound adapter — the ONE place in this
 * codebase that ever constructs a Graph API request or reads
 * WHATSAPP_ACCESS_TOKEN. Never imported by ReceptionistAgent directly;
 * only by src/messaging/create-messaging-provider.ts's factory and by
 * this file's own tests. See messaging-provider.ts's docstring for why
 * this boundary exists at all.
 *
 * Credentials are read ONCE at construction (never re-read per call, and
 * never logged — an outbound failure's error message is Meta's own
 * response body/status, which does not echo the token back). `fetch` is
 * used directly (Node 18+'s built-in, already relied on elsewhere in
 * this codebase's provider clients — see anthropic-chat-client.ts) —
 * no new HTTP dependency.
 */
export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
  /** Graph API version segment, e.g. "v21.0" — see config/env.ts's
   * WHATSAPP_API_VERSION (defaulted there, always present here). */
  apiVersion: string;
}

interface WhatsAppSendSuccessBody {
  messages?: { id?: string }[];
}

interface WhatsAppSendErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

/** Meta error `code` values documented as transient/throughput-related —
 * genuine finding from auditing this against Meta's real Graph API error
 * reference: these can arrive under a 400 status (not just 429), which a
 * status-only rule would misclassify as permanent and never retry. This
 * list only ever WIDENS what counts as retryable relative to the status-
 * code rule below — it never narrows it — so it cannot cause a genuinely
 * permanent error to be retried; it only catches transient ones the
 * status code alone would have hidden.
 *   4      — application request limit reached
 *   80007  — business account rate limit
 *   130429 — rate limit hit
 *   131048 — spam rate limit hit
 *   131056 — pair (sender/recipient) rate limit hit
 */
const KNOWN_TRANSIENT_ERROR_CODES = new Set([4, 80007, 130429, 131048, 131056]);

/** Retryable vs permanent classification. 429 (rate limited) and every
 * 5xx (Meta's own transient server-side trouble) are worth retrying
 * after a backoff; every other 4xx (401 bad/expired token, 400
 * malformed request or invalid recipient, 403 forbidden, 404 unknown
 * phone number id) will fail IDENTICALLY on a retry — the request
 * itself is wrong, not the moment it was sent, so retrying only delays
 * discovering that and wastes the retry budget. `errorCode` (Meta's own
 * numeric `error.code`, when the response body parsed) overrides a
 * non-retryable STATUS only for the specific, documented transient
 * codes above — deliberately narrow rather than trusting Meta's full
 * error taxonomy, which isn't stable/documented enough to branch on
 * generally. */
function isRetryable(status: number, errorCode: number | undefined): boolean {
  if (errorCode !== undefined && KNOWN_TRANSIENT_ERROR_CODES.has(errorCode)) return true;
  return status === 429 || status >= 500;
}

/** Meta's documented `to` format is digits only — country code + number,
 * no leading "+", "0", or hyphens. Genuine finding auditing this against
 * Meta's real API docs: this codebase's OWN internal customer identity
 * is "+"-prefixed E.164 (see webhook-processing.ts), and that value was
 * being passed straight through as the outbound recipient. Meta's API
 * has been observed tolerating a leading "+" in practice, but nothing
 * in this codebase should depend on undocumented leniency when the
 * fix is this cheap and this safe. */
function toMetaRecipientFormat(to: string): string {
  return to.replace(/^\+/, "");
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function createWhatsAppMessagingProvider(credentials: WhatsAppCredentials): MessagingProvider {
  const endpoint = `https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`;

  return {
    async sendText(to: string, body: string): Promise<OutboundMessageResult> {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: toMetaRecipientFormat(to),
            type: "text",
            text: { body },
          }),
          // Genuine gap found auditing this against the same "unbounded
          // call" class of risk already fixed for AnthropicChatClient
          // (see its own docstring): with no timeout, a hung outbound
          // call would hang sendReply, which is awaited before the
          // webhook route responds to Meta at all — an unrelated
          // inbound delivery's own acknowledgement latency, for no
          // reason. Bounded here the same way, independently of
          // whatever the retry worker's own timing looks like.
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        // Network-level failure OR the timeout above firing (both throw
        // from fetch) — never thrown onward; the caller must be able to
        // treat this exactly like any other delivery failure, never as
        // an uncaught rejection. Always retryable: nothing about a
        // network blip or a slow response says the SAME request would
        // fail again a minute later.
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        return {
          success: false,
          error: `WhatsApp send failed (network error): ${error instanceof Error ? error.message : "unknown error"}`,
          retryable: true,
          errorCode: timedOut ? "network_timeout" : "network_error",
          // The request may have reached Meta before the connection
          // dropped or the timeout fired.
          ambiguous: true,
        };
      }

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        let errorCode: number | undefined;
        try {
          const errorBody = (await response.json()) as WhatsAppSendErrorBody;
          if (errorBody.error?.message) message = errorBody.error.message;
          errorCode = errorBody.error?.code;
        } catch {
          // Response body wasn't valid JSON — fall back to the bare
          // status, never let a malformed error response itself throw.
        }
        return {
          success: false,
          error: `WhatsApp send failed: ${message}`,
          retryable: isRetryable(response.status, errorCode),
          errorCode: errorCode !== undefined ? `meta_${errorCode}` : `http_${response.status}`,
          httpStatus: response.status,
          ...(errorCode !== undefined ? { metaCode: errorCode } : {}),
          // A 5xx can be returned AFTER the provider accepted the
          // message; a 4xx is a definite rejection.
          ambiguous: response.status >= 500,
        };
      }

      // Genuine gap found auditing this: sendText's own contract (see
      // messaging-provider.ts) is "never throws" — but a malformed 2xx
      // response body (unlikely from Meta, not impossible) would have
      // thrown straight out of `response.json()` uncaught, violating
      // that contract and leaving the message's retry state never
      // updated at all (recordSendOutcome, in the caller, never runs).
      // A 2xx status is Meta's own authoritative "accepted" signal
      // regardless of whether the body happens to parse — degrade to a
      // successful send with no providerMessageId rather than throw.
      try {
        const successBody = (await response.json()) as WhatsAppSendSuccessBody;
        return { success: true, providerMessageId: successBody.messages?.[0]?.id };
      } catch {
        return { success: true, providerMessageId: undefined };
      }
    },
  };
}
