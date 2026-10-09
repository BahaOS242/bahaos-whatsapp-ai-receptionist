import { describe, expect, it } from "vitest";
// @ts-expect-error plain browser ES module, no types
import * as v from "../public/inbox/inbox-view.js";

const NOW = Date.parse("2026-08-20T15:00:00Z");
const allowed = { accept: false, takeover: true, assign: false, reply: false, release: false, close: true, reopen: false };
const detail = (over: object = {}) => ({
  conversation: { customerName: "Ana <b>", customerPhone: "+1242", status: "human_pending", assignee: null, handoffReason: "wants a person" },
  messages: [
    { id: "m1", direction: "inbound", senderType: "customer", content: "<script>alert(1)</script>", delivery: null },
    { id: "m2", direction: "outbound", senderType: "ai", content: "Hello", delivery: { state: "sent", retryable: false } },
    { id: "m3", direction: "outbound", senderType: "staff", content: "Hi", author: { name: "Sam" }, delivery: { state: "failed", error: "bad number", retryable: true } },
  ],
  allowedActions: allowed,
  aiPaused: true,
  ...over,
});

describe("inbox view", () => {
  it("escapes all dynamic text", () => {
    const html = v.renderDetail(detail(), []);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Ana &lt;b&gt;");
  });
  it("shows AI-paused indicator, handoff reason, and distinguishes customer/AI/staff", () => {
    const html = v.renderDetail(detail(), []);
    expect(html).toContain("AI paused");
    expect(html).toContain("wants a person");
    expect(html).toContain("msg cust");
    expect(html).toContain("msg ai");
    expect(html).toContain("msg staff");
    expect(html).toContain("Staff · Sam");
  });
  it("hides the AI-paused banner when AI is active", () => {
    expect(v.renderDetail(detail({ aiPaused: false }), [])).not.toContain("AI paused");
  });
  it("disables invalid actions and the composer; enables permitted ones", () => {
    const html = v.renderDetail(detail(), []);
    expect(html).toMatch(/data-action="accept" disabled/);
    expect(html).toMatch(/data-action="takeover">/);
    expect(html).toMatch(/<textarea[^>]*disabled/);
    const owned = v.renderDetail(detail({ allowedActions: { ...allowed, reply: true } }), []);
    expect(owned).not.toMatch(/<textarea[^>]*disabled/);
  });
  it("renders real delivery status and a retry control only for retryable failures", () => {
    const html = v.renderDetail(detail(), []);
    expect(html).toContain("Failed to send");
    expect(html).toContain("bad number");
    expect(html.match(/data-retry=/g)).toHaveLength(1);
  });
  it("only offers the staff picker when assignment is allowed", () => {
    expect(v.renderDetail(detail(), [{ id: "s1", name: "Sam" }])).not.toContain("data-assign");
    expect(v.renderDetail(detail({ allowedActions: { ...allowed, assign: true } }), [{ id: "s1", name: "Sam" }])).toContain("data-assign");
  });
  it("list: preview, state, waiting indicator, assignee, empty state, deterministic time", () => {
    const row = {
      id: "c1", status: "human_pending", customerName: null, customerPhone: "+1242", assignee: { name: "Sam" },
      waitingSince: new Date(NOW - 5 * 60_000).toISOString(), lastActivityAt: new Date(NOW - 2 * 3600_000).toISOString(),
      lastMessage: { preview: "need <help>", direction: "inbound" },
    };
    const html = v.renderList([row], "c1", NOW);
    expect(html).toContain("+1242");
    expect(html).toContain("Needs a human");
    expect(html).toContain("Waiting 5m ago");
    expect(html).toContain("2h ago");
    expect(html).toContain("Sam");
    expect(html).toContain("need &lt;help&gt;");
    expect(html).toContain('aria-current="true"');
    expect(v.renderList([], null, NOW)).toContain("No conversations match");
  });
  it("filters show counts and mark the active one", () => {
    const html = v.renderFilters({ all: 4, pending: 2, human: 1, ai: 1, closed: 0 }, "pending");
    expect(html).toContain("Needs human (2)");
    expect(html).toMatch(/data-filter="pending" aria-pressed="true"/);
  });
  it("ago() is stable for edge cases", () => {
    expect(v.ago(null, NOW)).toBe("");
    expect(v.ago(new Date(NOW + 5000).toISOString(), NOW)).toBe("just now");
    expect(v.ago(new Date(NOW - 3 * 86400_000).toISOString(), NOW)).toBe("3d ago");
  });
});
