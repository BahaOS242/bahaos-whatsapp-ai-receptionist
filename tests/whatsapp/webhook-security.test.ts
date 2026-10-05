import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";

/**
 * Focused, attack-oriented audit — Phase 11's explicit checklist.
 * Everything here is route-mechanics-only (no real Postgres, no live
 * LLM): a `db` stand-in that throws if invoked proves a given check
 * genuinely short-circuits before reaching persistence, and every
 * response is inspected for status code AND body shape (never a raw
 * stack trace/internal error leaked to the client).
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

function sign(secret: string, raw: Buffer | string): string {
  const buf = typeof raw === "string" ? Buffer.from(raw) : raw;
  return `sha256=${createHmac("sha256", secret).update(buf).digest("hex")}`;
}

function textPayload(overrides: Partial<{ from: string; id: string; phoneNumberId: string; body: string }> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              metadata: { phone_number_id: overrides.phoneNumberId ?? "PHONE_ID_1" },
              contacts: [{ profile: { name: "Trevor" }, wa_id: overrides.from ?? "12428012847" }],
              messages: [
                {
                  from: overrides.from ?? "12428012847",
                  id: overrides.id ?? "wamid.TEST1",
                  timestamp: "1700000000",
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

describe("SIGNATURE — Phase 11 checklist", () => {
  it("valid signature: accepted — never rejected as unauthenticated (401)", async () => {
    const env = loadEnv(BASE_ENV);
    // Minimal stub — proves signature verification let the request
    // through; full successful processing is proven separately against
    // a real Postgres (see tests/db/webhook-torture.test.ts etc.).
    const db = { transaction: vi.fn(() => { throw new Error("stub — not a real db"); }) };
    const app = createApp({ env, db: db as never, agent: { handleMessage: vi.fn() } as never });
    const payload = textPayload();
    const raw = JSON.stringify(payload);

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-hub-signature-256", sign("my-app-secret", raw))
      .set("content-type", "application/json")
      .send(raw);

    expect(res.status).not.toBe(401);
  });

  it("invalid signature (wrong secret): rejected (401), db never touched", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });
    const payload = textPayload();

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-hub-signature-256", sign("wrong-secret", JSON.stringify(payload)))
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_signature" });
  });

  it("missing signature header: rejected (401)", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app).post("/webhooks/whatsapp").send(textPayload());

    expect(res.status).toBe(401);
  });

  it("modified body after signing: rejected (401) — proves the signature covers the actual bytes, not a re-serialization", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });
    const original = JSON.stringify(textPayload({ body: "book a cleaning" }));
    const signature = sign("my-app-secret", original);
    const tampered = JSON.stringify(textPayload({ body: "book a root canal" }));

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-hub-signature-256", signature)
      .set("content-type", "application/json")
      .send(tampered);

    expect(res.status).toBe(401);
  });

  it("modified/garbage signature value: rejected (401), never throws", async () => {
    const env = loadEnv(BASE_ENV);
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-hub-signature-256", "sha256=not-a-real-hex-digest")
      .send(textPayload());

    expect(res.status).toBe(401);
  });

  it("secret missing entirely: signature check is skipped (documented gap), request still reaches processing (never rejected as unauthenticated)", async () => {
    const env = loadEnv({ ...BASE_ENV, WHATSAPP_APP_SECRET: undefined });
    const db = { transaction: vi.fn(() => { throw new Error("stub — not a real db"); }) };
    const app = createApp({ env, db: db as never, agent: { handleMessage: vi.fn() } as never });

    const res = await request(app).post("/webhooks/whatsapp").send(textPayload());

    expect(res.status).not.toBe(401);
  });

  it("PRODUCTION SECURITY WARNING: logs a loud warning at startup when the webhook is verify-token-active but has no app secret in production", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const env = loadEnv({ ...BASE_ENV, NODE_ENV: "production", WHATSAPP_APP_SECRET: undefined });
      createApp({ env, db: neverCalledDb() });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/signature verification is DISABLED/i));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("never warns in development/test even without an app secret — Phase 7's zero-configuration promise", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const env = loadEnv({ ...BASE_ENV, NODE_ENV: "development", WHATSAPP_APP_SECRET: undefined });
      createApp({ env, db: neverCalledDb() });

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("PAYLOAD — Phase 11 checklist: malformed/oversized requests fail safely, never as a 5xx that would trigger Meta retries", () => {
  const env = loadEnv({ ...BASE_ENV, WHATSAPP_APP_SECRET: undefined });

  it("malformed JSON: 400, never 500, never leaks a stack trace", async () => {
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("content-type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\S+\s+\(/); // no stack-trace-shaped content
  });

  it("empty body: 200, no crash, nothing processed", async () => {
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app).post("/webhooks/whatsapp").set("content-type", "application/json").send();

    expect(res.status).toBe(200);
  });

  it.each([
    ["missing entry", {}],
    ["missing changes", { entry: [{ id: "x" }] }],
    ["missing value", { entry: [{ changes: [{}] }] }],
    ["missing metadata", { entry: [{ changes: [{ value: { messages: [{ from: "1", id: "a", type: "text", text: { body: "hi" } }] } }] }] }],
    ["missing phone number id", { entry: [{ changes: [{ value: { metadata: {}, messages: [{ from: "1", id: "a", type: "text", text: { body: "hi" } }] } }] }] }],
    ["missing customer number (from)", { entry: [{ changes: [{ value: { messages: [{ id: "a", type: "text", text: { body: "hi" } }] } }] }] }],
    ["missing message id", { entry: [{ changes: [{ value: { messages: [{ from: "1", type: "text", text: { body: "hi" } }] } }] }] }],
  ])("%s: 200, never crashes, nothing processed", async (_label, body) => {
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app).post("/webhooks/whatsapp").send(body);

    expect(res.status).toBe(200);
  });

  it("oversized payload (>256kb): rejected with a proper 4xx (413 Payload Too Large), never 500 — never triggers a Meta retry loop", async () => {
    const app = createApp({ env, db: neverCalledDb() });
    const oversized = JSON.stringify({ entry: [], padding: "x".repeat(300_000) });

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("content-type", "application/json")
      .send(oversized);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("delivery-status notification (no `messages`, only `statuses`): 200, silently accepted, nothing processed", async () => {
    const app = createApp({ env, db: neverCalledDb() });
    const statusPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_ID_1" },
                statuses: [{ id: "wamid.ABC", status: "delivered", timestamp: "1700000000" }],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const res = await request(app).post("/webhooks/whatsapp").send(statusPayload);

    expect(res.status).toBe(200);
  });

  it("unsupported message type: never crashes the process even if downstream processing fails (a genuine processing error correctly surfaces as a 500 so Meta retries — see FAILURE RECOVERY in whatsapp-webhook.ts). Full proof it's genuinely handled (real handoff created) on a working backend lives in tests/db/whatsapp-webhook-integration.test.ts against a real Postgres", async () => {
    const app = createApp({ env, db: neverCalledDb() });
    const imagePayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_ID_1" },
                messages: [{ from: "12428012847", id: "wamid.IMG1", timestamp: "1700000000", type: "image", image: { id: "m1" } }],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const res = await request(app).post("/webhooks/whatsapp").send(imagePayload);

    // neverCalledDb() throwing simulates a genuine infrastructure
    // failure (e.g. Postgres unreachable) — this MUST surface as a 500
    // (never a crash, never a false-success 200 that would make Meta
    // give up retrying a message that was never actually processed) and
    // never leak the error's own details to the client.
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal_error" });
  });

  it("a REACTION (emoji tap) is silently acknowledged — never escalated, never replied to, never even touches the database", async () => {
    const app = createApp({ env, db: neverCalledDb() });
    const reactionPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_ID_1" },
                messages: [
                  {
                    from: "12428012847",
                    id: "wamid.REACT1",
                    timestamp: "1700000000",
                    type: "reaction",
                    reaction: { message_id: "wamid.ORIGINAL", emoji: "👍" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const res = await request(app).post("/webhooks/whatsapp").send(reactionPayload);

    // neverCalledDb() would have thrown (failing this test) had this
    // reached persistence at all — proving it's a genuine, complete
    // no-op, not merely "handled gracefully."
    expect(res.status).toBe(200);
  });
});

describe("IDENTITY — Phase 11 checklist", () => {
  const env = loadEnv({ ...BASE_ENV, WHATSAPP_APP_SECRET: undefined });

  it("unknown/mismatched phone number id: rejected before reaching persistence at all", async () => {
    const app = createApp({ env, db: neverCalledDb() });

    const res = await request(app).post("/webhooks/whatsapp").send(textPayload({ phoneNumberId: "SOME_OTHER_NUMBER" }));

    expect(res.status).toBe(200); // still 200 to Meta — never triggers a redelivery loop
    // neverCalledDb() would have thrown (failing this test) had processing reached the db layer.
  });

  it("cross-tenant attempt: a phoneNumberId belonging to nobody configured is never processed as this tenant's traffic", async () => {
    const withConfiguredNumber = loadEnv({ ...BASE_ENV, WHATSAPP_APP_SECRET: undefined, WHATSAPP_PHONE_NUMBER_ID: "REAL_NUMBER" });
    const app = createApp({ env: withConfiguredNumber, db: neverCalledDb() });

    const res = await request(app).post("/webhooks/whatsapp").send(textPayload({ phoneNumberId: "ATTACKER_NUMBER" }));

    expect(res.status).toBe(200);
  });
});
