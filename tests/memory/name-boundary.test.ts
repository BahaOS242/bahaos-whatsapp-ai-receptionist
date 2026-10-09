import { describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE as BIZ } from "../../src/ai/business-context";
import { trimNameAtBoundary } from "../../src/ai/correction-language";
import { extractCandidates } from "../../src/memory/extractor";

describe("name boundary (pure)", () => {
  it.each([
    ["Alisha not Alicia", "Alisha"], ["Alisha, not Alicia", "Alisha"], ["Sarah and my number", "Sarah"],
    ["Mary Jane", "Mary Jane"], ["not Alicia", ""], ["Alisha", "Alisha"],
    ["actually Trevon", "Trevon"], ["really Trevon", "Trevon"], ["actually not Alicia", ""], ["sorry, Trevon", "Trevon"],
  ])("%j -> %j", (i, o) => expect(trimNameAtBoundary(i)).toBe(o));
  it("customer memory never stores 'Alisha Not Alicia'", () => {
    const names = (m: string) => extractCandidates(m, BIZ).candidates.filter((c) => c.kind === "preferred_name").map((c) => c.value);
    // a negated sentence is screened out entirely (nothing stored) — never a corrupted "Alisha Not Alicia"
    expect(names("My name is Alisha not Alicia")).toEqual([]);
    expect(names("My name is Alisha, not Alicia")).toEqual([]);
    expect(names("My name is Sarah and I want a cleaning")).toEqual(["Sarah"]);
  });
});
