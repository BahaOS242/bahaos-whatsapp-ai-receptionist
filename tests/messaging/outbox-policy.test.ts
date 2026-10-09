import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { backoffSeconds, decideAfterFailure, OUTBOX_BACKOFF_SECONDS, OUTBOX_LEASE_SECONDS, OUTBOX_MAX_ATTEMPTS, OUTBOX_SEND_CEILING_MS, OUTBOX_SEND_MARGIN_MS } from "../../src/messaging/outbox";
import type { OutboundMessageResult } from "../../src/messaging/messaging-provider";

const now = new Date("2026-10-08T12:00:00Z");
const fail = (over: Partial<OutboundMessageResult> = {}): OutboundMessageResult => ({ success: false, error: "x", ...over });

describe("retry policy", () => {
  it("the documented schedule, with no jitter: 30s, 60s, 120s, 240s, then capped at 240s", () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5, 9].map((n) => backoffSeconds(n, mid))).toEqual([30, 60, 120, 240, 240, 240]);
    expect(OUTBOX_BACKOFF_SECONDS).toEqual([30, 60, 120, 240]);
    expect(OUTBOX_MAX_ATTEMPTS).toBe(5);
  });

  it("jitter is bounded to ±20% of the base for every attempt", () => {
    for (const attempt of [1, 2, 3, 4, 5]) {
      const base = OUTBOX_BACKOFF_SECONDS[Math.min(attempt - 1, 3)];
      expect(backoffSeconds(attempt, () => 0)).toBe(Math.round(base * 0.8));
      expect(backoffSeconds(attempt, () => 0.999999)).toBe(Math.round(base * 1.2));
    }
  });

  it("only an explicitly retryable failure is retried; unclassified failures are treated as permanent (the pre-existing safe default)", () => {
    expect(decideAfterFailure({ attemptNumber: 1, maxAttempts: 5, result: fail({ retryable: true }), now, rng: () => 0.5 })).toEqual({
      kind: "retry", delaySeconds: 30, availableAt: new Date(now.getTime() + 30_000),
    });
    expect(decideAfterFailure({ attemptNumber: 1, maxAttempts: 5, result: fail({ retryable: false }), now })).toEqual({ kind: "dead_letter", reason: "permanent" });
    expect(decideAfterFailure({ attemptNumber: 1, maxAttempts: 5, result: fail(), now })).toEqual({ kind: "dead_letter", reason: "permanent" });
  });

  it("a retryable failure on the LAST attempt is dead-lettered as exhausted — the loop is bounded", () => {
    expect(decideAfterFailure({ attemptNumber: 4, maxAttempts: 5, result: fail({ retryable: true }), now }).kind).toBe("retry");
    expect(decideAfterFailure({ attemptNumber: 5, maxAttempts: 5, result: fail({ retryable: true }), now })).toEqual({ kind: "dead_letter", reason: "exhausted" });
    expect(decideAfterFailure({ attemptNumber: 6, maxAttempts: 5, result: fail({ retryable: true }), now })).toEqual({ kind: "dead_letter", reason: "exhausted" });
  });

  it("timing constants are mutually consistent: lease > send margin > provider timeout (15s), so a claim outlives any send it permits", () => {
    expect(OUTBOX_SEND_CEILING_MS).toBeGreaterThan(15_000);
    expect(OUTBOX_SEND_MARGIN_MS).toBeGreaterThan(OUTBOX_SEND_CEILING_MS);
    expect(OUTBOX_LEASE_SECONDS * 1000).toBeGreaterThan(OUTBOX_SEND_MARGIN_MS * 2);
  });
});

describe("there is exactly ONE outbound path: the outbox worker", () => {
  const root = join(__dirname, "..", "..");
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (name === "node_modules" || name === "dist") return [];
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });
  }
  const sources = [...files(join(root, "src")), ...files(join(root, "scripts"))].map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));
  const code = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  it("only src/messaging/outbox-worker.ts ever CALLS MessagingProvider.sendText", () => {
    const callers = sources.filter((s) => /\.sendText\s*\(/.test(code(s.text))).map((s) => s.path);
    expect(callers).toEqual(["src/messaging/outbox-worker.ts"]);
  });

  // The ONE explicit exemption: an owner-run, read-only diagnostic (GET only, allow-listed paths, no sending). It is
  // verified below to contain no send path, so the rule "only the adapter can send" still holds.
  const READ_ONLY_GRAPH_DIAGNOSTIC = "scripts/staging/graph-diagnose.ts";

  it("only the WhatsApp adapter ever talks to the Graph API (plus the one read-only diagnostic)", () => {
    const hits = sources.filter((s) => /graph\.facebook\.com/.test(code(s.text))).map((s) => s.path);
    expect(hits.filter((p) => p !== READ_ONLY_GRAPH_DIAGNOSTIC)).toEqual(["src/messaging/whatsapp-messaging-provider.ts"]);
  });

  it("the read-only Graph diagnostic really is read-only: GET only, no send/write endpoints", () => {
    const diag = sources.find((s) => s.path === READ_ONLY_GRAPH_DIAGNOSTIC);
    if (!diag) return; // the diagnostic is optional tooling
    const text = code(diag.text);
    expect(text).toMatch(/method:\s*"GET"/);
    expect(text).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"|\.sendText\b|\/messages\b|message_templates|subscribed_apps"\s*,\s*\{\s*method/);
    // the allow-list never admits a /messages-style endpoint
    expect(diag.text).not.toMatch(/ALLOWED[^;]*messages\)/);
  });

  it("GATE 1 (structural): the webhook route has no provider, no worker entry point, and no way to deliver — it can only QUEUE and WAKE", () => {
    const route = sources.find((s) => s.path === "src/routes/whatsapp-webhook.ts")!;
    const text = code(route.text);
    for (const forbidden of [/\bsendText\b/, /\bMessagingProvider\b/, /createMessagingProvider/, /drainConversation/, /runOutboxPass/, /deliverClaimed/, /claimOutboundBatch/, /graph\.facebook/]) {
      expect(text, String(forbidden)).not.toMatch(forbidden);
    }
    expect(text).toMatch(/wakeOutboxWorkers/); // the only coupling: a fire-and-forget signal
    // ...and the same for the code that runs INSIDE the business transaction:
    const processing = sources.find((s) => s.path === "src/whatsapp/webhook-processing.ts")!;
    expect(code(processing.text)).not.toMatch(/sendText|runOutboxPass|drainConversation|MessagingProvider/);
  });

  it("the removed direct-send helpers are really gone", () => {
    for (const s of sources) {
      expect(code(s.text), s.path).not.toMatch(/\bsendReply\b|recordSendOutcome|runOutboundRetryWorker|startOutboundRetryPoller/);
    }
  });
});
