import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

/** No DB needed: unauthenticated and malformed requests must be rejected
 * BEFORE any database access. (Authenticated paths are covered in tests/db.) */
describe("inbox HTTP surface", () => {
  const app = createApp(undefined, { db: new Proxy({}, { get() { throw new Error("DB must not be touched"); } }) as never });

  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const server = app.listen(0);
    try {
      const { port } = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined,
      });
      return { res, text: await res.text() };
    } finally { server.close(); }
  }

  it.each([
    ["GET", "/api/inbox/conversations"],
    ["GET", "/api/inbox/me"],
    ["POST", "/api/inbox/conversations/00000000-0000-4000-8000-000000000000/takeover"],
    ["POST", "/api/inbox/conversations/00000000-0000-4000-8000-000000000000/reply"],
  ])("%s %s without a session is 401, no-store", async (m, p) => {
    const { res, text } = await call(m, p, m === "GET" ? undefined : {});
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({ error: "unauthenticated" });
  });

  it("a non-bearer Authorization header is 401 without touching the database", async () => {
    const { res } = await call("GET", "/api/inbox/me", undefined, { authorization: "Basic abc" });
    expect(res.status).toBe(401);
  });

  it("serves the UI with a strict CSP and no sniffing", async () => {
    const { res, text } = await call("GET", "/inbox/");
    expect(res.status).toBe(200);
    expect(text).toContain("BahaOS Inbox");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
