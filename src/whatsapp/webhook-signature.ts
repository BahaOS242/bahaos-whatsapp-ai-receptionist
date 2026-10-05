import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the RAW request
 * body bytes, using WHATSAPP_APP_SECRET — Meta's documented webhook
 * authenticity mechanism (an HMAC-SHA256 over the exact bytes Meta sent,
 * not the re-serialized/re-parsed JSON, since re-serialization can
 * change whitespace/key order and silently break the signature).
 *
 * Requires the RAW body buffer, not `req.body` (already JSON-parsed by
 * the time Express route handlers see it) — see app.ts's `verify`
 * callback on the WhatsApp webhook's own json() middleware, which
 * captures it specifically for this. Constant-time comparison
 * (timingSafeEqual) — a naive `===` on a secret-derived value is a
 * timing side-channel, however impractical to actually exploit here;
 * this codebase already does the equivalent for other integrity checks
 * where it matters, and the cost of doing it right is zero.
 */
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expected = `sha256=${expectedHex}`;

  // timingSafeEqual throws on a length mismatch rather than returning
  // false — an attacker-controlled header could easily be a different
  // length, so this must be checked first, not treated as a bug.
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signatureHeader, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
