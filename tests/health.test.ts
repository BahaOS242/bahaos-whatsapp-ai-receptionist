import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("GET /health", () => {
  it("returns 200 with an ok status payload", async () => {
    const app = createApp();

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "bahaos-whatsapp-ai-receptionist",
    });
    expect(typeof res.body.timestamp).toBe("string");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });
});

describe("unmapped routes", () => {
  it("returns 404 for unknown paths", async () => {
    const app = createApp();

    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
