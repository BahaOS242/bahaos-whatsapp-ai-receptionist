import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDevelopmentOnly, createLocalChatApp } from "../../scripts/local-chat/local-chat-app";

/**
 * Local-only browser chat: FREE simulation (rule-based fallback provider + in-memory simulated booking tools). It must never
 * touch an AI API, the database, Google Calendar or WhatsApp, and must refuse to run anywhere but a developer's own machine.
 * Clock frozen at 2026-10-09T16:00Z (a Friday) so "Tuesday" resolves deterministically.
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T16:00:00Z") }); });
afterEach(() => { vi.useRealTimers(); });

const post = (app: ReturnType<typeof createLocalChatApp>, path: string, body?: unknown) =>
  request(app).post(path).set("content-type", "application/json").send(body === undefined ? "{}" : JSON.stringify(body));
async function newConversation(app: ReturnType<typeof createLocalChatApp>) {
  const res = await post(app, "/api/conversations");
  expect(res.status).toBe(201);
  return res.body.id as string;
}
const say = (app: ReturnType<typeof createLocalChatApp>, id: string, message: string) => post(app, `/api/conversations/${id}/messages`, { message });

describe("it is clearly a free simulation", () => {
  it("/api/info and the page say so", async () => {
    const app = createLocalChatApp();
    const info = await request(app).get("/api/info");
    expect(info.body).toEqual({ mode: "free_simulation", provider: "DevRuleBasedAIProvider", bookingTools: "simulated", realAi: false, realDatabase: false, realWhatsApp: false, live: { available: false } });
    const page = await request(app).get("/");
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/Free simulation/);
    expect(page.text).toMatch(/New conversation/);
    expect(page.headers["content-security-policy"]).toMatch(/default-src 'none'/);
    expect(page.headers["cache-control"]).toBe("no-store");
  });
});

describe("a booking through the real agent and conversation state", () => {
  it("never books before the separate final 'yes'; then exactly one simulated booking with the right payload", async () => {
    const app = createLocalChatApp();
    const id = await newConversation(app);
    let last = await say(app, id, "I want a cleaning");
    for (const m of ["yes", "Tuesday 2pm", "Trevor 2428012847"]) last = await say(app, id, m);
    expect(last.body.bookingState).toMatchObject({ service: "Routine cleaning", time: "14:00", name: "Trevor", phone: "+12428012847", pendingAction: "confirm_booking" });
    expect(last.body.reply).toMatch(/Reply YES to confirm/);
    expect(last.body.actions).toEqual([]); // nothing executed yet
    const done = await say(app, id, "yes");
    expect(done.body.actions).toEqual([{ type: "request_appointment", ok: true }]);
    expect(done.body.reply).toMatch(/captured/i);
    const history = await request(app).get(`/api/conversations/${id}`);
    expect(history.body.messages.map((m: { role: string }) => m.role)).toEqual(Array(5).fill(["customer", "assistant"]).flat());
  });

  it("corrections and ambiguous times behave as in the terminal chat", async () => {
    const app = createLocalChatApp();
    const id = await newConversation(app);
    for (const m of ["I want a cleaning", "yes", "Tuesday 2pm"]) await say(app, id, m);
    const amb = await say(app, id, "3pm or 4pm");
    expect(amb.body.bookingState.timeClarification).toBe(true);
    expect(amb.body.bookingState.time).toBe("14:00"); // kept, not guessed
    expect(amb.body.reply).toMatch(/what one time/i);
  });
});

describe("conversations are isolated", () => {
  it("state, history and bookings never leak between conversations", async () => {
    const app = createLocalChatApp();
    const a = await newConversation(app);
    const b = await newConversation(app);
    expect(a).not.toBe(b);
    for (const m of ["I want a cleaning", "yes", "Tuesday 2pm"]) await say(app, a, m);
    const bState = await say(app, b, "hello");
    expect(bState.body.bookingState).toEqual({});
    expect((await request(app).get(`/api/conversations/${b}`)).body.messages).toHaveLength(2);
    expect((await request(app).get(`/api/conversations/${a}`)).body.messages).toHaveLength(6);
  });

  it("a new conversation starts empty even after another finished a booking", async () => {
    const app = createLocalChatApp();
    const a = await newConversation(app);
    for (const m of ["I want a cleaning", "yes", "Tuesday 2pm", "Trevor 2428012847", "yes"]) await say(app, a, m);
    const c = await newConversation(app);
    expect((await request(app).get(`/api/conversations/${c}`)).body.messages).toEqual([]);
    expect((await say(app, c, "yes")).body.actions).toEqual([]);
  });

  it("is bounded: the oldest conversation is evicted past the cap", async () => {
    const app = createLocalChatApp({ maxConversations: 3 });
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await newConversation(app));
    expect((await request(app).get(`/api/conversations/${ids[0]}`)).status).toBe(404);
    expect((await request(app).get(`/api/conversations/${ids[3]}`)).status).toBe(200);
  });
});

describe("input validation", () => {
  it("rejects unknown/invalid ids and bad messages without crashing", async () => {
    const app = createLocalChatApp();
    const id = await newConversation(app);
    expect((await say(app, "00000000-0000-4000-8000-000000000000", "hi")).status).toBe(404);
    expect((await say(app, "not-a-uuid", "hi")).status).toBe(400);
    expect((await say(app, id, "")).status).toBe(400);
    expect((await say(app, id, "   ")).status).toBe(400);
    expect((await say(app, id, "x".repeat(501))).status).toBe(400);
    expect((await post(app, `/api/conversations/${id}/messages`, { message: 42 })).status).toBe(400);
    expect((await say(app, id, "x".repeat(500))).status).toBe(200);
  });
});

describe("local-only protections", () => {
  it("refuses a non-local Host header (DNS-rebinding defence)", async () => {
    const app = createLocalChatApp();
    expect((await request(app).get("/").set("Host", "evil.example.com")).status).toBe(403);
    expect((await request(app).get("/api/info").set("Host", "bahaos-staging.onrender.com")).status).toBe(403);
    expect((await request(app).get("/").set("Host", "localhost:3100")).status).toBe(200);
    expect((await request(app).get("/").set("Host", "[::1]:3100")).status).toBe(200);
  });
  it("refuses cross-site POSTs and non-JSON bodies (CSRF defence)", async () => {
    const app = createLocalChatApp();
    expect((await post(app, "/api/conversations").set("Origin", "https://evil.example.com")).status).toBe(403);
    expect((await post(app, "/api/conversations").set("Origin", "http://127.0.0.1:3100")).status).toBe(201);
    expect((await request(app).post("/api/conversations").set("content-type", "text/plain").send("x")).status).toBe(415);
  });
  it("assertLocalDevelopmentOnly refuses production and any hosting-platform environment", () => {
    expect(() => assertLocalDevelopmentOnly({ NODE_ENV: "production" })).toThrow(/local development only/i);
    for (const marker of ["RENDER", "RAILWAY_ENVIRONMENT", "DYNO", "FLY_APP_NAME", "VERCEL", "KUBERNETES_SERVICE_HOST", "K_SERVICE"]) {
      expect(() => assertLocalDevelopmentOnly({ [marker]: "1" })).toThrow(/local development only/i);
    }
    expect(() => assertLocalDevelopmentOnly({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertLocalDevelopmentOnly({})).not.toThrow();
  });
});

describe("structural guarantees (static)", () => {
  const files = readdirSync(join(process.cwd(), "scripts/local-chat")).filter((f) => f.endsWith(".ts") && f !== "live-mode.ts"); // live-mode.ts has its own, stricter-scoped rules in live-mode.test.ts
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const read = (f: string) => readFileSync(join(process.cwd(), "scripts/local-chat", f), "utf8");
  it("imports no configuration, database, network or provider-SDK code and never reads credentials", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const code = strip(read(f));
      expect(code, f).not.toMatch(/getEnv|loadEnv|getDb|getPool|dotenv|from "pg"|drizzle|googleapis|@anthropic|openai|fetch\(|graph\.facebook|createAiProvider|createReceptionistTools|createMessagingProvider|createLanguageObservationRecorder|process\.env\.(?!NODE_ENV|LOCAL_CHAT_PORT|LOCAL_CHAT_LIVE|LOCAL_CHAT_BUDGET_USD)/);
    }
  });
  it("constructs ONLY the fallback provider and the simulated tools, and listens on 127.0.0.1 only", () => {
    const all = files.map((f) => strip(read(f))).join("\n");
    expect(all).toMatch(/new DevRuleBasedAIProvider\(\)/);
    expect(all).toMatch(/createSimulatedReceptionistTools\(/);
    expect(all).toMatch(/listen\([^)]*"127\.0\.0\.1"/);
    expect(all).not.toMatch(/0\.0\.0\.0|"::"/);
  });
  it("the page script renders message text as text (no innerHTML) and only calls its own /api paths", () => {
    const js = readFileSync(join(process.cwd(), "scripts/local-chat/page/app.js"), "utf8");
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    expect(js).toMatch(/textContent\s*=\s*text/);
    expect(js).not.toMatch(/https?:\/\//); // no absolute URLs: it can only talk to the page's own origin
    const calls = [...js.matchAll(/api\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.startsWith("/api/"), c).toBe(true);
    expect(readFileSync(join(process.cwd(), "scripts/local-chat/page/index.html"), "utf8")).not.toMatch(/<script[^>]*src="https?:/i);
  });
  it("the production app and server never reference the local chat", () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
    for (const f of walk(join(process.cwd(), "src"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/local-chat/);
  });
});
