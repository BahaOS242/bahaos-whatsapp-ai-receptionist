import { describe, expect, it } from "vitest";
import { authorityRank, compareAuthority, isServableAuthority } from "../../src/knowledge/authority";
import { isEligibleDocument } from "../../src/knowledge/store";

const now = new Date("2026-06-01T12:00:00Z");
const ok = { status: "approved" as const, authority: "human_approved" as const, effectiveAt: null, expiresAt: null };

describe("what may ever reach a customer-facing answer", () => {
  it("only approved, servable, in-date documents", () => {
    expect(isEligibleDocument(ok, now)).toBe(true);
    expect(isEligibleDocument({ ...ok, authority: "approved_document" }, now)).toBe(true);
  });

  it("an 'unreviewed' document is NEVER eligible — even if its status were somehow 'approved'", () => {
    expect(isEligibleDocument({ ...ok, authority: "unreviewed" }, now)).toBe(false);
    expect(isServableAuthority("unreviewed")).toBe(false);
  });

  it.each(["draft", "pending_review", "superseded", "rejected", "archived"] as const)("status %s is never eligible", (status) => {
    expect(isEligibleDocument({ ...ok, status }, now)).toBe(false);
  });

  it("not yet effective / already expired / expiring exactly now are not eligible", () => {
    expect(isEligibleDocument({ ...ok, effectiveAt: new Date("2026-06-02T00:00:00Z") }, now)).toBe(false);
    expect(isEligibleDocument({ ...ok, expiresAt: new Date("2026-05-31T00:00:00Z") }, now)).toBe(false);
    expect(isEligibleDocument({ ...ok, expiresAt: now }, now)).toBe(false);
    expect(isEligibleDocument({ ...ok, effectiveAt: now }, now)).toBe(true);
  });
});

describe("authority ordering", () => {
  it("structured configuration > human-approved > approved document > unreviewed", () => {
    expect(authorityRank("structured_config")).toBeLessThan(authorityRank("human_approved"));
    expect(authorityRank("human_approved")).toBeLessThan(authorityRank("approved_document"));
    expect(authorityRank("approved_document")).toBeLessThan(authorityRank("unreviewed"));
    expect(compareAuthority("structured_config", "approved_document")).toBeLessThan(0);
    expect(compareAuthority("unreviewed", "human_approved")).toBeGreaterThan(0);
    expect(compareAuthority("human_approved", "human_approved")).toBe(0);
  });
});
