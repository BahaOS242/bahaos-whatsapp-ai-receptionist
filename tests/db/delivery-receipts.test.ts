import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { queue, ScriptedProvider, seedConversation } from "./outbox-helpers";
import { runOutboxPass } from "../../src/messaging/outbox-worker";
import { recordDeliveryReceipts } from "../../src/messaging/delivery-receipts";
import type { NormalizedDeliveryReceipt } from "../../src/whatsapp/webhook-payload";

/**
 * Provider delivery receipts (Meta status webhooks) vs API acceptance. `outbox_messages.status = 'sent'` means ONLY that the
 * provider's API accepted the message; `delivery_status` is what later happened to it, derived from an append-only ledger so
 * receipts that arrive early, twice or out of order still converge. REQUIRES a real Postgres — run via `npm run test:db`.
 */
describe("delivery receipts (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  beforeEach(async () => { await resetTestData(db); });
  afterAll(async () => { await pool.end(); });

  const receipt = (providerMessageId: string, status: NormalizedDeliveryReceipt["status"], at: number, extra: Partial<NormalizedDeliveryReceipt> = {}): NormalizedDeliveryReceipt => ({
    providerMessageId,
    status,
    eventAt: new Date(at * 1000),
    ...extra,
  });

  /** Queue one message and let the worker send it; the provider returns `wamid`. */
  async function sentMessage(wamid: string, existingTenantId?: string) {
    const f = await seedConversation(db, existingTenantId);
    await queue(db, f, "hello");
    const provider = new ScriptedProvider(() => ({ success: true, providerMessageId: wamid }));
    await runOutboxPass(db, provider, { tenantId: f.tenantId });
    return { f };
  }
  async function row(tenantId: string, wamid: string) {
    const r = await db.execute(sql`select status, delivery_status, delivered_at, delivery_error_code, delivery_error_title from outbox_messages where tenant_id = ${tenantId}::uuid and provider_message_id = ${wamid}`);
    return r.rows[0] as Record<string, unknown> | undefined;
  }
  const ledger = async (tenantId: string, wamid: string) =>
    Number((await db.execute(sql`select count(*)::int n from outbox_delivery_receipts where tenant_id = ${tenantId}::uuid and provider_message_id = ${wamid}`)).rows[0].n);

  it("API acceptance stays 'sent'; delivered then read are recorded separately and never regress", async () => {
    const { f } = await sentMessage("wamid.A1");
    expect(await row(f.tenantId, "wamid.A1")).toMatchObject({ status: "sent", delivery_status: null });
    await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.A1", "sent", 100), receipt("wamid.A1", "delivered", 101)]);
    expect(await row(f.tenantId, "wamid.A1")).toMatchObject({ status: "sent", delivery_status: "delivered" });
    await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.A1", "read", 102)]);
    expect(await row(f.tenantId, "wamid.A1")).toMatchObject({ delivery_status: "read" });
    await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.A1", "delivered", 101), receipt("wamid.A1", "sent", 100)]); // late, older
    expect(await row(f.tenantId, "wamid.A1")).toMatchObject({ delivery_status: "read", status: "sent" });
  });

  it("a failed receipt is recorded with its Meta code while the API status stays 'sent' (acceptance ≠ delivery)", async () => {
    const { f } = await sentMessage("wamid.F1");
    const r = await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.F1", "failed", 200, { errorCode: "meta_131031", errorTitle: "Business Account locked" })]);
    expect(r).toMatchObject({ recorded: 1, duplicates: 0, matched: 1, awaitingProviderId: 0, failedReceipts: 1 });
    expect(await row(f.tenantId, "wamid.F1")).toMatchObject({
      status: "sent",
      delivery_status: "failed",
      delivery_error_code: "meta_131031",
      delivery_error_title: "Business Account locked",
    });
  });

  it("duplicates are ignored and counted; the ledger holds one row", async () => {
    const { f } = await sentMessage("wamid.D1");
    await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.D1", "delivered", 300)]);
    const again = await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.D1", "delivered", 300), receipt("wamid.D1", "delivered", 300)]);
    expect(again).toMatchObject({ recorded: 0, duplicates: 2 });
    expect(await ledger(f.tenantId, "wamid.D1")).toBe(1);
    expect(await row(f.tenantId, "wamid.D1")).toMatchObject({ delivery_status: "delivered" });
  });

  it("out-of-order and conflicting receipts converge: delivered/read always beat failed; failed beats sent", async () => {
    const a = await sentMessage("wamid.O1");
    await recordDeliveryReceipts(db, a.f.tenantId, [receipt("wamid.O1", "read", 5), receipt("wamid.O1", "sent", 1), receipt("wamid.O1", "delivered", 3)]);
    expect(await row(a.f.tenantId, "wamid.O1")).toMatchObject({ delivery_status: "read" });

    const b = await sentMessage("wamid.O2");
    await recordDeliveryReceipts(db, b.f.tenantId, [receipt("wamid.O2", "failed", 9, { errorCode: "meta_131026" })]);
    expect(await row(b.f.tenantId, "wamid.O2")).toMatchObject({ delivery_status: "failed", delivery_error_code: "meta_131026" });
    await recordDeliveryReceipts(db, b.f.tenantId, [receipt("wamid.O2", "delivered", 8)]); // contradicts the failure: the stronger evidence wins
    expect(await row(b.f.tenantId, "wamid.O2")).toMatchObject({ delivery_status: "delivered", delivery_error_code: null });

    const c = await sentMessage("wamid.O3");
    await recordDeliveryReceipts(db, c.f.tenantId, [receipt("wamid.O3", "sent", 1), receipt("wamid.O3", "failed", 2, { errorCode: "meta_131047" })]);
    expect(await row(c.f.tenantId, "wamid.O3")).toMatchObject({ delivery_status: "failed" });
  });

  it("a receipt that arrives BEFORE provider_message_id is saved is kept, and applied the moment the worker saves the id", async () => {
    const f = await seedConversation(db);
    const early = await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.EARLY", "delivered", 50), receipt("wamid.EARLY", "read", 51)]);
    expect(early).toMatchObject({ recorded: 2, matched: 0, awaitingProviderId: 1 });
    await queue(db, f, "hello");
    await runOutboxPass(db, new ScriptedProvider(() => ({ success: true, providerMessageId: "wamid.EARLY" })), { tenantId: f.tenantId });
    expect(await row(f.tenantId, "wamid.EARLY")).toMatchObject({ status: "sent", delivery_status: "read" });
  });

  it("a receipt for an unknown id never throws and creates no outbox row", async () => {
    const f = await seedConversation(db);
    const r = await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.NOBODY", "delivered", 1)]);
    expect(r).toMatchObject({ recorded: 1, matched: 0, awaitingProviderId: 1 });
    expect(Number((await db.execute(sql`select count(*)::int n from outbox_messages`)).rows[0].n)).toBe(0);
  });

  it("tenant isolation: tenant B's receipt for tenant A's wamid changes nothing of A's; each tenant's own copy of an id is independent", async () => {
    const a = await sentMessage("wamid.SHARED");
    const b = await sentMessage("wamid.SHARED"); // pathological: the same id in a second tenant
    expect(b.f.tenantId).not.toBe(a.f.tenantId);
    await recordDeliveryReceipts(db, b.f.tenantId, [receipt("wamid.SHARED", "read", 10)]);
    expect(await row(a.f.tenantId, "wamid.SHARED")).toMatchObject({ delivery_status: null });
    expect(await row(b.f.tenantId, "wamid.SHARED")).toMatchObject({ delivery_status: "read" });
    await recordDeliveryReceipts(db, a.f.tenantId, [receipt("wamid.SHARED", "failed", 11, { errorCode: "meta_131031" })]);
    expect(await row(a.f.tenantId, "wamid.SHARED")).toMatchObject({ delivery_status: "failed" });
    expect(await row(b.f.tenantId, "wamid.SHARED")).toMatchObject({ delivery_status: "read", delivery_error_code: null });
    expect(await ledger(a.f.tenantId, "wamid.SHARED")).toBe(1);
    expect(await ledger(b.f.tenantId, "wamid.SHARED")).toBe(1);
  });

  it("RACE: a receipt and the worker saving provider_message_id at the same instant always converge (30 rounds, mixed order)", async () => {
    for (let i = 0; i < 30; i++) {
      const wamid = `wamid.RACE-${i}-${randomUUID()}`;
      const f = await seedConversation(db);
      await queue(db, f, "hello");
      const provider = new ScriptedProvider(() => ({ success: true, providerMessageId: wamid }));
      const send = () => runOutboxPass(db, provider, { tenantId: f.tenantId });
      const rec = () => recordDeliveryReceipts(db, f.tenantId, [receipt(wamid, "delivered", 1000 + i)]);
      await Promise.all(i % 2 === 0 ? [send(), rec()] : [rec(), send()]);
      expect(await row(f.tenantId, wamid), `round ${i}`).toMatchObject({ status: "sent", delivery_status: "delivered" });
    }
  }, 60_000);

  it("receipts never create customer messages, conversations or outbound replies", async () => {
    const { f } = await sentMessage("wamid.Q1");
    const before = await db.execute(sql`select (select count(*)::int from messages) m, (select count(*)::int from outbox_messages) o, (select count(*)::int from conversations) c`);
    await recordDeliveryReceipts(db, f.tenantId, [receipt("wamid.Q1", "failed", 7, { errorCode: "meta_131031" })]);
    const after = await db.execute(sql`select (select count(*)::int from messages) m, (select count(*)::int from outbox_messages) o, (select count(*)::int from conversations) c`);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
