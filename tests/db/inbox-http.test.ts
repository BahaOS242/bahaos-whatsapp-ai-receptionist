import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { createStaffUser } from "../../src/inbox/auth";
import { createTestDb, resetTestData } from "./db-test-helpers";
import { seedConversation } from "./outbox-helpers";
import { tenants } from "../../src/db/schema";
import { eq } from "drizzle-orm";

/* eslint-disable @typescript-eslint/no-explicit-any -- test reads loosely-typed JSON */
type Json = Record<string, any>;

/** End-to-end over HTTP with a real DB: login → list → takeover → reply, tenant isolation. */
describe("Inbox HTTP API (REQUIRES a real Postgres)", () => {
  const { db, pool } = createTestDb();
  const app = createApp(undefined, { db });
  beforeEach(async () => { await resetTestData(db); });
  afterAll(async () => { await pool.end(); });

  async function http(method: string, path: string, body?: unknown, token?: string) {
    const server = app.listen(0);
    try {
      const { port } = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}/api/inbox${path}`, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: (await res.json()) as Json };
    } finally { server.close(); }
  }

  it("full staff flow; another tenant's conversation is a 404 identical to a missing one", async () => {
    const mine = await seedConversation(db);
    const theirs = await seedConversation(db);
    const slug = (await db.query.tenants.findFirst({ where: eq(tenants.id, mine.tenantId) }))!.slug;
    await createStaffUser(db, { tenantId: mine.tenantId, email: "sam@example.test", name: "Sam", role: "staff", password: "correct horse battery" });

    expect((await http("POST", "/login", { tenant: slug, email: "sam@example.test", password: "wrong" })).status).toBe(401);
    const login = await http("POST", "/login", { tenant: slug, email: "sam@example.test", password: "correct horse battery" });
    expect(login.status).toBe(200);
    const token = login.json.token as string;

    const list = await http("GET", "/conversations?filter=all", undefined, token);
    expect(list.json.conversations.map((c: { id: string }) => c.id)).toEqual([mine.conversationId]);

    const cid = mine.conversationId;
    expect((await http("POST", `/conversations/${cid}/reply`, { body: "hi", clientMessageId: "client-id-9001" }, token)).status).toBe(409);
    expect((await http("POST", `/conversations/${cid}/takeover`, {}, token)).status).toBe(200);
    const reply = await http("POST", `/conversations/${cid}/reply`, { body: "hello!", clientMessageId: "client-id-9002" }, token);
    expect(reply.status).toBe(202);
    const again = await http("POST", `/conversations/${cid}/reply`, { body: "hello!", clientMessageId: "client-id-9002" }, token);
    expect(again.status).toBe(200);
    expect(again.json.deduplicated).toBe(true);

    const detail = await http("GET", `/conversations/${cid}`, undefined, token);
    expect(detail.json.aiPaused).toBe(true);
    expect(detail.json.messages.at(-1)).toMatchObject({ content: "hello!", senderType: "staff", delivery: { state: "queued" } });

    const foreign = await http("GET", `/conversations/${theirs.conversationId}`, undefined, token);
    const missing = await http("GET", `/conversations/${randomUUID()}`, undefined, token);
    expect(foreign).toEqual(missing);
    expect(foreign.status).toBe(404);
    expect((await http("POST", `/conversations/${theirs.conversationId}/takeover`, {}, token)).status).toBe(404);
    expect((await http("GET", "/conversations/not-a-uuid", undefined, token)).status).toBe(404);

    await http("POST", "/logout", {}, token);
    expect((await http("GET", "/me", undefined, token)).status).toBe(401);
  });
});
