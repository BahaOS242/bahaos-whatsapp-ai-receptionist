import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../../src/whatsapp/webhook-signature";

const APP_SECRET = "test-app-secret";

function sign(secret: string, body: Buffer): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature — cryptographic correctness against a known, independently-published test vector", () => {
  // RFC 4231 Test Case 2 (HMAC-SHA256) — key="Jefe", data="what do ya
  // want for nothing?", expected digest published independently of this
  // codebase. This is NOT the same thing as live Meta verification (see
  // this file's own header comment / META_SETUP.md) — it proves the
  // underlying HMAC-SHA256 computation itself is correct against a
  // standard reference, which the OTHER tests below (self-signed via
  // this same file's `sign` helper) cannot: they'd pass identically even
  // if both `sign` and `verifyWebhookSignature` shared the same bug.
  it("matches RFC 4231 Test Case 2's published HMAC-SHA256 digest exactly", () => {
    const key = "Jefe";
    const data = Buffer.from("what do ya want for nothing?");
    const expectedDigest = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

    expect(verifyWebhookSignature(key, data, `sha256=${expectedDigest}`)).toBe(true);
  });

  it("rejects when even one hex character of a correctly-shaped signature is wrong", () => {
    const key = "Jefe";
    const data = Buffer.from("what do ya want for nothing?");
    const almostRight = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3842"; // last char flipped

    expect(verifyWebhookSignature(key, data, `sha256=${almostRight}`)).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a correctly-signed body", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    const signature = sign(APP_SECRET, body);

    expect(verifyWebhookSignature(APP_SECRET, body, signature)).toBe(true);
  });

  it("rejects a signature computed with the WRONG secret", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    const signature = sign("wrong-secret", body);

    expect(verifyWebhookSignature(APP_SECRET, body, signature)).toBe(false);
  });

  it("rejects a signature for a DIFFERENT body than the one actually sent — catches a re-serialized/tampered payload", () => {
    const originalBody = Buffer.from(JSON.stringify({ hello: "world" }));
    const signature = sign(APP_SECRET, originalBody);
    const tamperedBody = Buffer.from(JSON.stringify({ hello: "tampered" }));

    expect(verifyWebhookSignature(APP_SECRET, tamperedBody, signature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));

    expect(verifyWebhookSignature(APP_SECRET, body, undefined)).toBe(false);
  });

  it("rejects a malformed/garbage signature header without throwing", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));

    expect(() => verifyWebhookSignature(APP_SECRET, body, "not-a-real-signature")).not.toThrow();
    expect(verifyWebhookSignature(APP_SECRET, body, "not-a-real-signature")).toBe(false);
    expect(verifyWebhookSignature(APP_SECRET, body, "")).toBe(false);
  });
});
