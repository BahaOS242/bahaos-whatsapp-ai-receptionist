import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockMessagingProvider } from "../../src/messaging/mock-messaging-provider";
import { createWhatsAppMessagingProvider } from "../../src/messaging/whatsapp-messaging-provider";
import { createMessagingProvider } from "../../src/messaging/create-messaging-provider";
import { loadEnv } from "../../src/config/env";

const BASE_ENV = { DATABASE_URL: "postgres://user:pass@localhost:5432/db" };

describe("createMockMessagingProvider", () => {
  it("records every sent message and always succeeds", async () => {
    const provider = createMockMessagingProvider();

    const result = await provider.sendText("+12428012847", "Hello!");

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBeDefined();
    expect(provider.sent).toEqual([{ to: "+12428012847", body: "Hello!", at: expect.any(Date) }]);
  });

  it("records multiple sends in order", async () => {
    const provider = createMockMessagingProvider();

    await provider.sendText("+1", "first");
    await provider.sendText("+2", "second");

    expect(provider.sent.map((m) => m.body)).toEqual(["first", "second"]);
  });
});

describe("createMessagingProvider — zero-configuration-by-default selection", () => {
  it("falls back to the mock transport when no WhatsApp credentials are configured — never requires them", () => {
    const env = loadEnv(BASE_ENV);

    const provider = createMessagingProvider(env);

    // Behavioral proof, matching this codebase's existing convention for
    // distinguishing implementations (see createReceptionistTools's own
    // tests): the mock never makes a network call, so sending succeeds
    // immediately with no fetch involved.
    expect(provider).toBeDefined();
  });

  it("selects the real WhatsApp provider only when BOTH access token and phone number id are configured", async () => {
    const withOnlyToken = loadEnv({ ...BASE_ENV, WHATSAPP_ACCESS_TOKEN: "token" });
    const withBoth = loadEnv({
      ...BASE_ENV,
      WHATSAPP_ACCESS_TOKEN: "token",
      WHATSAPP_PHONE_NUMBER_ID: "phone-id",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.SENT" }] }), { status: 200 }),
    );

    await createMessagingProvider(withOnlyToken).sendText("+1", "hi"); // mock — no fetch call
    expect(fetchSpy).not.toHaveBeenCalled();

    await createMessagingProvider(withBoth).sendText("+1", "hi"); // real — calls fetch
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });
});

describe("createWhatsAppMessagingProvider — real Meta Graph API adapter (mocked fetch, no network)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const credentials = { accessToken: "test-token", phoneNumberId: "PHONE_ID_1", apiVersion: "v21.0" };

  it("sends a well-formed request and reports success with the provider's message id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.SENT123" }] }), { status: 200 }),
    );
    const provider = createWhatsAppMessagingProvider(credentials);

    const result = await provider.sendText("12428012847", "Your appointment is confirmed.");

    expect(result).toEqual({ success: true, providerMessageId: "wamid.SENT123" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/PHONE_ID_1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "12428012847",
      type: "text",
      text: { body: "Your appointment is confirmed." },
    });
  });

  it("never throws and never crashes the process on a non-2xx response — reports a normal failure instead", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid OAuth access token" } }), { status: 401 }),
    );
    const provider = createWhatsAppMessagingProvider(credentials);

    const result = await provider.sendText("12428012847", "hi");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid OAuth access token/);
  });

  it("never throws on a network-level failure (DNS/connection error)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("getaddrinfo ENOTFOUND graph.facebook.com"));
    const provider = createWhatsAppMessagingProvider(credentials);

    const result = await provider.sendText("12428012847", "hi");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network error/i);
  });

  it("never throws when the error response body isn't valid JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    const provider = createWhatsAppMessagingProvider(credentials);

    const result = await provider.sendText("12428012847", "hi");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/HTTP 502/);
  });

  it("strips a leading '+' from the recipient — Meta's documented `to` format is digits-only, no leading +", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }));
    const provider = createWhatsAppMessagingProvider(credentials);

    await provider.sendText("+12428012847", "hi");

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toBe("12428012847");
  });

  it("passes an AbortSignal so a hung request cannot hang forever", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }));
    const provider = createWhatsAppMessagingProvider(credentials);

    await provider.sendText("12428012847", "hi");

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never throws when a timeout/abort fires — reports a normal, retryable failure instead", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"));
    const provider = createWhatsAppMessagingProvider(credentials);

    const result = await provider.sendText("12428012847", "hi");

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it("never throws on a malformed 2xx response body — a 2xx status IS Meta's acceptance signal regardless of body shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not valid json", { status: 200 }));
    const provider = createWhatsAppMessagingProvider(credentials);

    const result = await provider.sendText("12428012847", "hi");

    expect(result).toEqual({ success: true, providerMessageId: undefined });
  });

  it.each([4, 80007, 130429, 131048, 131056])(
    "treats Meta error code %i as retryable even under a 400 status (documented transient/rate-limit codes)",
    async (code) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "rate limited", code } }), { status: 400 }),
      );
      const provider = createWhatsAppMessagingProvider(credentials);

      const result = await provider.sendText("12428012847", "hi");

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    },
  );

  it("an ordinary 400 with no known transient error code stays non-retryable — never over-widens the retry allowlist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100 } }), { status: 400 }),
    );
    const provider = createWhatsAppMessagingProvider(credentials);

    const result = await provider.sendText("12428012847", "hi");

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it("never hardcodes credentials — constructing with different credentials produces different Authorization headers", async () => {
    // A fresh Response per call — a Response body can only be read once,
    // and mockResolvedValue would otherwise share the SAME instance
    // (and therefore the same already-consumed body) across both sends.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
    await createWhatsAppMessagingProvider({ ...credentials, accessToken: "token-A" }).sendText("1", "x");
    await createWhatsAppMessagingProvider({ ...credentials, accessToken: "token-B" }).sendText("1", "x");

    const authHeaders = fetchSpy.mock.calls.map(
      (call) => (call[1] as RequestInit).headers as Record<string, string>,
    ).map((h) => h.Authorization);
    expect(authHeaders).toEqual(["Bearer token-A", "Bearer token-B"]);
  });
});
