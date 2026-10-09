import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { loadEnv } from "../../src/config/env";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { resolveTenant } from "../../src/db/domain-resolution";
import { runOutboxPass } from "../../src/messaging/outbox-worker";
import type { AIProvider } from "../../src/ai/types";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { queue, ScriptedProvider, seedConversation } from "./outbox-helpers";

/** Delivery receipts through the real webhook route: signed, phone-number-checked, no reply, no AI call. REQUIRES a real Postgres. */
describe("webhook route: delivery receipts (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  beforeEach(async () => { await resetTestData(db); });
  afterAll(async () => { await pool.end(); });

  const SECRET = "test-app-secret";
  const env = loadEnv({
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v",
    WHATSAPP_APP_SECRET: SECRET,
    WHATSAPP_PHONE_NUMBER_ID: "PNID1",
  });
  const sign = (raw: string) => `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
  const statusBody = (phoneNumberId: string, statuses: unknown[]) =>
    JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId }, statuses } }] }] });

  function appWithTrippedAgent() {
    const provider: AIProvider = { generateResponse: vi.fn(async () => { throw new Error("the AI must never be called for a receipt"); }) } as unknown as AIProvider;
    const tools = {} as never;
    return { app: createApp({ env, db, business: BAHAMAS_DENTAL_SERVICE, agent: new ReceptionistAgent(provider, tools) }), provider };
  }
  async function sentRow(wamid: string) {
    const tenantId = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
    const f = await seedConversation(db, tenantId);
    await queue(db, f, "hello");
    await runOutboxPass(db, new ScriptedProvider(() => ({ success: true, providerMessageId: wamid })), { tenantId });
    return tenantId;
  }
  const counts = async () => (await db.execute(sql`select (select count(*)::int from messages) m, (select count(*)::int from conversations) c, (select count(*)::int from outbox_messages) o`)).rows[0];
  const post = (app: ReturnType<typeof createApp>, raw: string, sig?: string) =>
    request(app).post("/webhooks/whatsapp").set("content-type", "application/json").set("x-hub-signature-256", sig ?? sign(raw)).send(raw);

  it("a signed failed receipt is recorded, the outbox row shows 'not delivered', and nothing else happens", async () => {
    const tenantId = await sentRow("wamid.R1");
    const { app, provider } = appWithTrippedAgent();
    const before = await counts();
    const raw = statusBody("PNID1", [{ id: "wamid.R1", status: "failed", timestamp: "1791569332", recipient_id: "1", errors: [{ code: 131031, title: "Business Account locked" }] }]);
    const res = await post(app, raw);
    expect(res.status).toBe(200);
    const o = (await db.execute(sql`select status, delivery_status, delivery_error_code from outbox_messages where tenant_id = ${tenantId}::uuid and provider_message_id = 'wamid.R1'`)).rows[0];
    expect(o).toMatchObject({ status: "sent", delivery_status: "failed", delivery_error_code: "meta_131031" });
    expect(await counts()).toEqual(before);
    expect(provider.generateResponse).not.toHaveBeenCalled();
  });

  it("a replayed identical receipt is a harmless duplicate", async () => {
    await sentRow("wamid.R2");
    const { app } = appWithTrippedAgent();
    const raw = statusBody("PNID1", [{ id: "wamid.R2", status: "delivered", timestamp: "100" }]);
    expect((await post(app, raw)).status).toBe(200);
    expect((await post(app, raw)).status).toBe(200);
    expect(Number((await db.execute(sql`select count(*)::int n from outbox_delivery_receipts`)).rows[0].n)).toBe(1);
  });

  it("a receipt for another phone_number_id is ignored (still 200), exactly like a message would be rejected", async () => {
    await sentRow("wamid.R3");
    const { app } = appWithTrippedAgent();
    const res = await post(app, statusBody("SOMEONE_ELSE", [{ id: "wamid.R3", status: "read", timestamp: "5" }]));
    expect(res.status).toBe(200);
    expect(Number((await db.execute(sql`select count(*)::int n from outbox_delivery_receipts`)).rows[0].n)).toBe(0);
  });

  it("an unsigned or wrongly signed receipt is rejected (401) and nothing is recorded", async () => {
    await sentRow("wamid.R4");
    const { app } = appWithTrippedAgent();
    const raw = statusBody("PNID1", [{ id: "wamid.R4", status: "read", timestamp: "5" }]);
    expect((await request(app).post("/webhooks/whatsapp").set("content-type", "application/json").send(raw)).status).toBe(401);
    expect((await post(app, raw, "sha256=" + "0".repeat(64))).status).toBe(401);
    expect(Number((await db.execute(sql`select count(*)::int n from outbox_delivery_receipts`)).rows[0].n)).toBe(0);
  });

  it("malformed statuses are accepted with 200 and record nothing", async () => {
    const { app } = appWithTrippedAgent();
    expect((await post(app, statusBody("PNID1", [null, 3, {}, { id: "x", status: "weird" }]))).status).toBe(200);
    expect(Number((await db.execute(sql`select count(*)::int n from outbox_delivery_receipts`)).rows[0].n)).toBe(0);
  });
});
