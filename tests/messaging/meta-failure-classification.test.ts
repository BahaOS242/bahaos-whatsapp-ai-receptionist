import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhatsAppMessagingProvider } from "../../src/messaging/whatsapp-messaging-provider";

/** The outbox needs three things from the Meta adapter beyond the existing
 * retryable/permanent contract (which tests/messaging/messaging-providers
 * .test.ts still pins unchanged): a stable errorCode, an `ambiguous` flag
 * (the request may have been accepted), and diagnostics. */
const provider = createWhatsAppMessagingProvider({ accessToken: "t", phoneNumberId: "1", apiVersion: "v21.0" });
afterEach(() => vi.restoreAllMocks());

const respond = (status: number, json?: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(json === undefined ? "nope" : JSON.stringify(json), { status }));

describe("Meta failure classification feeding the outbox", () => {
  it("a timeout is retryable, coded, and AMBIGUOUS (Meta may have received it)", async () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(e);
    expect(await provider.sendText("12428012847", "hi")).toMatchObject({ success: false, retryable: true, errorCode: "network_timeout", ambiguous: true });
  });

  it("a connection error is retryable, coded, and ambiguous", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    expect(await provider.sendText("12428012847", "hi")).toMatchObject({ retryable: true, errorCode: "network_error", ambiguous: true });
  });

  it("a 5xx is retryable and ambiguous; the HTTP status is recorded", async () => {
    respond(503, { error: { message: "Service Unavailable" } });
    expect(await provider.sendText("12428012847", "hi")).toMatchObject({ retryable: true, errorCode: "http_503", httpStatus: 503, ambiguous: true });
  });

  it("a 429 is retryable and NOT ambiguous (a definite rejection)", async () => {
    respond(429, { error: { message: "slow down" } });
    expect(await provider.sendText("12428012847", "hi")).toMatchObject({ retryable: true, errorCode: "http_429", ambiguous: false });
  });

  it("a documented transient Meta code under HTTP 400 stays retryable, coded by the Meta code", async () => {
    respond(400, { error: { message: "rate limit hit", code: 130429 } });
    expect(await provider.sendText("12428012847", "hi")).toMatchObject({ retryable: true, errorCode: "meta_130429", metaCode: 130429, httpStatus: 400, ambiguous: false });
  });

  it.each([
    [400, 131026, "invalid recipient"],
    [400, 100, "malformed request"],
    [401, 190, "invalid credentials"],
    [403, undefined, "forbidden"],
    [404, undefined, "unknown phone number id"],
  ])("a %i / Meta %s (%s) is PERMANENT, definite, and coded", async (status, code, _what) => {
    respond(status, { error: { message: "no", ...(code ? { code } : {}) } });
    const r = await provider.sendText("12428012847", "hi");
    expect(r).toMatchObject({ success: false, retryable: false, ambiguous: false, httpStatus: status });
    expect(r.errorCode).toBe(code ? `meta_${code}` : `http_${status}`);
  });

  it("an unparseable error body still yields a coded, classified failure and never throws", async () => {
    respond(502);
    expect(await provider.sendText("12428012847", "hi")).toMatchObject({ retryable: true, errorCode: "http_502" });
  });

  it("existing hardening is intact: digits-only recipient, bearer auth, bounded timeout signal", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 }));
    const r = await provider.sendText("+12428012847", "hi");
    expect(r).toEqual({ success: true, providerMessageId: "wamid.OK" });
    const [, init] = spy.mock.calls[0];
    expect(JSON.parse(String(init?.body)).to).toBe("12428012847");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
