import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";

/**
 * Route-mechanics tests — no real Postgres, no live LLM. Everything
 * exercised here (GET verification, signature enforcement, malformed-
 * payload safety, phone-number-id validation) happens BEFORE this
 * codebase's persistence/agent layer is ever reached, so a `db`/`agent`
 * stand-in that THROWS if actually invoked is the strongest possible
 * proof that these checks genuinely short-circuit rather than merely
 * happening to produce the right answer. Full end-to-end processing
 * (real persistence, idempotency, concurrency) is covered separately in
 * tests/db/whatsapp-webhook-integration.test.ts (REQUIRES a real
 * Postgres, run via `npm run test:db`), matching this codebase's
 * existing split between fast unit coverage and DB-backed integration
 * coverage.
 */

const BASE_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "my-verify-token",
  WHATSAPP_APP_SECRET: "my-app-secret",
  WHATSAPP_PHONE_NUMBER_ID: "PHONE_ID_1",
};

function neverCalledDb() {
  return {
    transaction: vi.fn(() => {
      throw new Error("db.transaction must not be called for this request");
    }),
  } as unknown as Parameters<typeof createApp>[0] extends { db?: infer T } ? T : never;
}

function sign(secret: string, body: object): string {
  const raw = Buffer.from(JSON.stringify(body));
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

function textPayload(text: string, opts: { phoneNumberId?: string; messageId?: string; from?: string } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              metadata: { phone_number_id: opts.phoneNumberId ?? "PHONE_ID_1" },
              contacts: [{ profile: { name: "Trevor" }, wa_id: opts.from ?? "12428012847" }],
              messages: [
                {
                  from: opts.from ?? "12428012847",
                  id: opts.messageId ?? "wamid.TEST1",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: text },
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

describe("GET /webhooks/whatsapp — verification challenge", () => {
  it("returns the raw challenge when mode/verify_token match", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "my-verify-token", "hub.challenge": "abc123" });

    expect(res.status).toBe(200);
    expect(res.text).toBe("abc123");
  });

  it("returns 403 for the wrong verify token", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "abc123" });

    expect(res.status).toBe(403);
  });

  it("returns 403 when no verify token is configured at all", async () => {
    const env = loadEnv({ ...BASE_ENV, WHATSAPP_WEBHOOK_VERIFY_TOKEN: undefined });
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "anything", "hub.challenge": "abc123" });

    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-'subscribe' mode", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "unsubscribe", "hub.verify_token": "my-verify-token", "hub.challenge": "abc123" });

    expect(res.status).toBe(403);
  });
});

describe("POST /webhooks/whatsapp — signature enforcement", () => {
  it("rejects a request with no signature header when WHATSAPP_APP_SECRET is configured", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app).post("/webhooks/whatsapp").send(textPayload("book a cleaning"));

    expect(res.status).toBe(401);
  });

  it("rejects a request with an INCORRECT signature", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });
    const payload = textPayload("book a cleaning");

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-hub-signature-256", sign("wrong-secret", payload))
      .send(payload);

    expect(res.status).toBe(401);
  });

  it("accepts a request with a CORRECT signature — never rejected as unauthenticated (full successful processing is proven separately against a real Postgres)", async () => {
    const env = loadEnv(BASE_ENV);
    // A minimal, incomplete db stub — enough to prove signature
    // verification let the request through to processing (it fails
    // LATER, past authentication, exactly like a real infra failure
    // would per this file's own FAILURE RECOVERY tests) without needing
    // to fake Drizzle's full query surface just for this narrow check.
    const db = { transaction: vi.fn(() => { throw new Error("stub — not a real db"); }) };
    const app = createApp({ env, db: db as never, agent: { handleMessage: vi.fn() } as never });
    const payload = textPayload("book a cleaning");

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-hub-signature-256", sign("my-app-secret", payload))
      .send(payload);

    expect(res.status).not.toBe(401);
  });

  it("skips signature verification entirely when WHATSAPP_APP_SECRET is not configured — documented, honest gap (see whatsapp-webhook.ts's PHASE 13 note)", async () => {
    const env = loadEnv({ ...BASE_ENV, WHATSAPP_APP_SECRET: undefined });
    const db = { transaction: vi.fn(() => { throw new Error("stub — not a real db"); }) };
    const app = createApp({ env, db: db as never, agent: { handleMessage: vi.fn() } as never });

    const res = await request(app).post("/webhooks/whatsapp").send(textPayload("book a cleaning"));

    expect(res.status).not.toBe(401);
  });
});

describe("POST /webhooks/whatsapp — malformed payloads never crash the process", () => {
  const env = loadEnv({ ...BASE_ENV, WHATSAPP_APP_SECRET: undefined });

  it.each([
    [{}],
    [{ entry: "garbage" }],
    [{ entry: [{ changes: [{ value: { messages: [{ from: "1" }] } }] }] }], // missing id/type
    [[1, 2, 3]],
    ["a plain string body"],
    [null],
  ])("returns 200 (never 500, never hangs) for malformed body %#", async (body) => {
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app).post("/webhooks/whatsapp").send(body as never);

    expect(res.status).toBe(200);
  });
});

describe("POST /webhooks/whatsapp — tenant/business-number validation (Phase 11)", () => {
  it("rejects (never processes) a message addressed to an unexpected phone_number_id", async () => {
    const env = loadEnv({ ...BASE_ENV, WHATSAPP_APP_SECRET: undefined });
    const app = createApp({ env, db: neverCalledDb() });
    const payload = textPayload("book a cleaning", { phoneNumberId: "SOME_OTHER_NUMBER" });

    const res = await request(app).post("/webhooks/whatsapp").send(payload);

    // Still 200 to Meta (never triggers a redelivery loop) — the
    // rejection is enforced by never calling db.transaction at all,
    // which neverCalledDb() would have thrown on if it had been.
    expect(res.status).toBe(200);
  });
});
