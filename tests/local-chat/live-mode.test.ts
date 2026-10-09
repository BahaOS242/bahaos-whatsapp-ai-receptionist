import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagesSdk } from "../../scripts/live-eval/capped-client";
import { createLocalChatApp } from "../../scripts/local-chat/local-chat-app";
import { createLiveSession, LIVE_BUDGET_CAP_USD, readAnthropicKey, redactSecrets } from "../../scripts/local-chat/live-mode";

/**
 * "Live Haiku / simulated bookings": real model calls through the SAME spend controls as the approved live evaluation
 * (authoritative count_tokens before every call, full max-output reservation, halt on unknown usage / failure), $1.00 per
 * server session, enforced SERVER-side. These tests use a FAKE SDK: no network, no key, no money.
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const KEY = "sk-ant-api03-TESTKEY-DO-NOT-LEAK-0123456789";

interface FakeOpts { delayMs?: number; counted?: unknown; usage?: unknown; text?: string; countThrows?: boolean; createThrows?: string }
function fakeSdk(o: FakeOpts = {}) {
  const calls = { count: 0, create: 0 };
  const sdk: MessagesSdk = {
    messages: {
      async countTokens() {
        calls.count++;
        if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs)); // real I/O latency: lets concurrent calls interleave
        if (o.countThrows) throw new Error(`count failed ${KEY}`);
        return { input_tokens: "counted" in o ? o.counted : 3000 };
      },
      async create() {
        calls.create++;
        if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
        if (o.createThrows) throw new Error(o.createThrows);
        return {
          model: "claude-haiku-4-5-20251001",
          content: [{ type: "text", text: o.text ?? "Got it." }],
          usage: "usage" in o ? (o.usage as { input_tokens?: unknown; output_tokens?: unknown }) : { input_tokens: 3000, output_tokens: 40 },
        };
      },
    },
  };
  return { sdk, calls };
}

type App = ReturnType<typeof createLocalChatApp>;
const post = (app: App, path: string, body?: unknown) => request(app).post(path).set("content-type", "application/json").send(JSON.stringify(body ?? {}));
async function conv(app: App, mode?: string) { const r = await post(app, "/api/conversations", mode ? { mode } : {}); return { status: r.status, id: r.body.id as string, body: r.body }; }
const say = (app: App, id: string, message: string) => post(app, `/api/conversations/${id}/messages`, { message });

describe("availability and labelling", () => {
  it("without a live session: free only; asking for live is refused", async () => {
    const app = createLocalChatApp();
    expect((await request(app).get("/api/info")).body.live).toEqual({ available: false });
    expect((await conv(app, "live")).status).toBe(409);
    expect((await conv(app, "bogus")).status).toBe(400);
    expect((await conv(app)).body.mode).toBe("free");
  });
  it("with a live session: advertises the model, the $1 budget and a zero spend", async () => {
    const { sdk } = fakeSdk();
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
    const info = (await request(app).get("/api/info")).body;
    expect(info.mode).toBe("free_simulation"); // the default conversation mode is still free
    expect(info.live).toMatchObject({ available: true, label: "Live Haiku / simulated bookings", model: "claude-haiku-4-5-20251001", budgetUsd: 1, spentUsd: 0, calls: 0, halted: null, estimate: true });
    expect((await conv(app, "live")).body.mode).toBe("live");
  });
  it("the page offers both modes, the live label and a spend display", async () => {
    const html = (await request(createLocalChatApp()).get("/")).text;
    for (const needle of ["Free simulation", "Live Haiku / simulated bookings", "id=\"mode\"", "id=\"spend\"", "New conversation"]) expect(html).toContain(needle);
  });
});

describe("live turns, spend display and free-mode isolation", () => {
  it("a live turn calls the model once, tracks the estimated spend, and bookings stay simulated", async () => {
    const { sdk, calls } = fakeSdk({ text: "Got it." });
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
    const c = await conv(app, "live");
    const r = await say(app, c.id, "hello");
    expect(r.status).toBe(200);
    expect(calls).toEqual({ count: 1, create: 1 });
    expect(r.body.live).toMatchObject({ calls: 1, estimate: true });
    expect(r.body.live.spentUsd).toBeCloseTo((3000 * 1 + 40 * 5) / 1e6, 8);
    expect(r.body.live.remainingUsd).toBeCloseTo(1 - r.body.live.spentUsd, 8);
    // full booking through the LLM path: every action runs on the in-memory simulated tools
    let last = r;
    for (const m of ["I want a cleaning", "yes", "Tuesday 2pm", "Trevor 2428012847"]) last = await say(app, c.id, m);
    expect(last.body.bookingState.pendingAction).toBeTruthy();
    expect((await say(app, c.id, "yes")).body.actions).toEqual([{ type: "request_appointment", ok: true }]);
  });
  it("free conversations never touch the SDK, even when live is available; modes are isolated", async () => {
    const { sdk, calls } = fakeSdk();
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
    const free = await conv(app, "free");
    for (const m of ["I want a cleaning", "yes", "Tuesday 2pm"]) await say(app, free.id, m);
    expect(calls).toEqual({ count: 0, create: 0 });
    const live = await conv(app, "live");
    expect((await say(app, live.id, "hello")).body.bookingState).toEqual({});
    expect(calls.create).toBe(1);
  });
});

describe("budget enforcement (server-side)", () => {
  it("refuses a call whose worst case could exceed the remaining budget — before any model request", async () => {
    const { sdk, calls } = fakeSdk();
    // budget $0.01, stop at 95% = $0.0095; worst case for 3000 in + 1024 out = $0.00812
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY, budgetUsd: 0.01 }) });
    const c = await conv(app, "live");
    const first = await say(app, c.id, "hello");
    expect(first.body.live.halted).toBeNull();
    const second = await say(app, c.id, "hello again"); // spent 0.0032 + worst 0.00812 > 0.0095
    expect(calls.create).toBe(1); // the second request was NEVER sent
    expect(second.body.live.halted).toMatch(/next call could cost/);
    const third = await say(app, c.id, "and again");
    expect(third.status).toBe(409);
    expect(calls).toEqual({ count: 2, create: 1 }); // nothing further at all (not even a token count)
    expect(third.body.live.halted).toBeTruthy();
  });
  it("a budget above the authorised $1.00 is refused outright", () => {
    const { sdk } = fakeSdk();
    expect(LIVE_BUDGET_CAP_USD).toBe(1);
    expect(() => createLiveSession({ sdk, apiKey: KEY, budgetUsd: 5 })).toThrow(/authorised/);
    expect(() => createLiveSession({ sdk, apiKey: KEY, budgetUsd: 0 })).toThrow();
    expect(() => createLiveSession({ sdk, apiKey: KEY, budgetUsd: Number.NaN })).toThrow();
  });
  it("unknown usage halts live mode and charges the reserved worst case", async () => {
    const { sdk, calls } = fakeSdk({ usage: undefined });
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
    const c = await conv(app, "live");
    const r = await say(app, c.id, "hello");
    expect(r.body.live.halted).toMatch(/usage/i);
    expect(r.body.live.spentUsd).toBeGreaterThan(0.005);
    expect((await say(app, c.id, "hello")).status).toBe(409);
    expect(calls.create).toBe(1);
  });
  it("an unavailable token count means NO model request is made", async () => {
    for (const counted of [undefined, -1, Number.NaN, "lots"]) {
      const { sdk, calls } = fakeSdk({ counted });
      const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
      const c = await conv(app, "live");
      const r = await say(app, c.id, "hello");
      expect(calls.create, String(counted)).toBe(0);
      expect(r.body.live.halted).toMatch(/count/i);
    }
    const { sdk, calls } = fakeSdk({ countThrows: true });
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
    await say(app, (await conv(app, "live")).id, "hello");
    expect(calls.create).toBe(0);
  });
  it("a failed request (transport/provider error) halts and charges the worst case; it is never retried", async () => {
    const { sdk, calls } = fakeSdk({ createThrows: `socket hang up ${KEY}` });
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
    const c = await conv(app, "live");
    const r = await say(app, c.id, "hello");
    expect(calls.create).toBe(1);
    expect(r.body.live.halted).toMatch(/request failed/);
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    await say(app, c.id, "hello");
    expect(calls.create).toBe(1);
  });
  it("RACE: parallel turns across conversations cannot spend past the budget (one global gate)", async () => {
    const { sdk, calls } = fakeSdk({ delayMs: 15 });
    const live = createLiveSession({ sdk, apiKey: KEY, budgetUsd: 0.02 }); // stop $0.019: room for ~2 calls at 0.0032 + 0.00812 reserve
    const app = createLocalChatApp({ live });
    const ids = await Promise.all([conv(app, "live"), conv(app, "live"), conv(app, "live")]);
    await Promise.all(ids.flatMap((c) => [say(app, c.id, "hello"), say(app, c.id, "again")]));
    const snap = (await request(app).get("/api/info")).body.live;
    expect(snap.spentUsd).toBeLessThanOrEqual(0.02);
    expect(calls.create).toBeLessThan(6);
    expect(calls.create).toBeGreaterThanOrEqual(1);
    expect(snap.halted).toBeTruthy();
  });
});

describe("the key stays server-side", () => {
  it("never appears in any response, page asset or log line, including on errors", async () => {
    const logs: string[] = [];
    for (const m of ["log", "warn", "error", "info"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
    const { sdk } = fakeSdk({ createThrows: `401 invalid x-api-key ${KEY}` });
    const app = createLocalChatApp({ live: createLiveSession({ sdk, apiKey: KEY }) });
    const c = await conv(app, "live");
    const bodies = [
      (await request(app).get("/")).text, (await request(app).get("/app.js")).text, (await request(app).get("/app.css")).text,
      JSON.stringify((await request(app).get("/api/info")).body), JSON.stringify((await say(app, c.id, "hello")).body),
      JSON.stringify((await request(app).get(`/api/conversations/${c.id}`)).body), JSON.stringify((await say(app, c.id, "again")).body),
    ];
    for (const b of [...bodies, ...logs]) { expect(b).not.toContain(KEY); expect(b).not.toContain("TESTKEY"); }
  });
  it("redactSecrets removes the key and any sk-ant token", () => {
    expect(redactSecrets(`a ${KEY} b sk-ant-other-1234567890abcdef c`, KEY)).toBe("a [REDACTED] b [REDACTED] c");
  });
  it("readAnthropicKey reads ONLY ANTHROPIC_API_KEY from a .env file, never touching other values or process.env", () => {
    const dir = mkdtempSync(join(tmpdir(), "lc-env-"));
    const file = join(dir, ".env");
    writeFileSync(file, `DATABASE_URL=postgres://u:p@h/db\nWHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxx\nANTHROPIC_API_KEY="${KEY}"\nOTHER=1\n`);
    const before = JSON.stringify(process.env);
    expect(readAnthropicKey({ envFile: file, processEnv: {} })).toBe(KEY);
    expect(JSON.stringify(process.env)).toBe(before); // nothing exported
    expect(readAnthropicKey({ envFile: join(dir, "missing"), processEnv: {} })).toBeUndefined();
    writeFileSync(file, "DATABASE_URL=x\n");
    expect(readAnthropicKey({ envFile: file, processEnv: {} })).toBeUndefined();
    expect(readAnthropicKey({ envFile: file, processEnv: { ANTHROPIC_API_KEY: "from-process-env" } })).toBe("from-process-env");
  });
});

describe("structural guarantees for live mode (static)", () => {
  const dir = join(process.cwd(), "scripts/local-chat");
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const read = (f: string) => strip(readFileSync(join(dir, f), "utf8"));
  it("only live-mode.ts knows the key or the SDK; nothing in the chat can reach a database, calendar, WhatsApp or Graph", () => {
    for (const f of ["local-chat-app.ts", "server.ts", "live-mode.ts"]) {
      expect(read(f), f).not.toMatch(/getDb|getPool|from "pg"|drizzle|googleapis|graph\.facebook|createMessagingProvider|createReceptionistTools|createDatabaseReceptionistTools|createGoogleCalendar|WHATSAPP_|GOOGLE_CALENDAR|DATABASE_URL/);
    }
    for (const f of ["local-chat-app.ts", "server.ts"]) expect(read(f), f).not.toMatch(/ANTHROPIC_API_KEY|@anthropic-ai\/sdk|dotenv/);
    expect(read("live-mode.ts")).toMatch(/maxRetries:\s*0/); // no unbudgeted SDK retries
    expect(read("live-mode.ts")).not.toMatch(/process\.env\s*\[|\.\.\.process\.env|JSON\.stringify\(process\.env/);
  });
  it("booking tools are always the in-memory simulated ones; the live provider is only ever wrapped in the spend-gated client", () => {
    const app = read("local-chat-app.ts");
    expect(app).toMatch(/createSimulatedReceptionistTools\(/);
    expect(app).toMatch(/new LLMProvider\(live\.client\)/);
    expect(app).not.toMatch(/new LLMProvider\((?!live\.client)/);
  });
  it("the page never contains a key or any absolute URL", () => {
    const js = readFileSync(join(dir, "page/app.js"), "utf8");
    expect(js).not.toMatch(/api[_-]?key|sk-ant|x-api-key|anthropic/i);
    expect(js).not.toMatch(/https?:\/\//);
  });
});
