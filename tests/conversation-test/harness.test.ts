import { describe, expect, it } from "vitest";
import {
  adaptations,
  allScenarios,
  typoVariants,
  bahamianVariants,
} from "../../scripts/conversation-test/variants";
import { heldOutIds } from "../../scripts/conversation-test/held-out";
import { runChecks } from "../../scripts/conversation-test/checks";
import index from "../../scripts/conversation-test/source-index.json";
import type { EvalTranscript } from "../../scripts/eval/types";

const conv = index.conversations as { id: string; split: string }[];

describe("Taskmaster-derived conversation set: integrity", () => {
  it("has exactly one adaptation per development source and none for held-out", () => {
    const dev = conv
      .filter((c) => c.split === "development")
      .map((c) => c.id)
      .sort();
    expect(dev).toHaveLength(48);
    expect(adaptations.map((a) => a.sourceId).sort()).toEqual(dev);
    for (const s of allScenarios) expect(heldOutIds).not.toContain(s.sourceId);
    expect(heldOutIds).toHaveLength(12);
  });
  it("derived variants keep their parent's source group", () => {
    for (const v of [...typoVariants, ...bahamianVariants]) {
      const parent = adaptations.find((a) => a.id === v.derivedFrom);
      expect(parent?.sourceId).toBe(v.sourceId);
    }
  });
  it("typo variants cover at least half of the adaptations; Bahamian ones are labelled", () => {
    expect(typoVariants.length).toBeGreaterThanOrEqual(adaptations.length / 2);
    for (const v of bahamianVariants) expect(v.augmentation).toMatch(/AUTHORED AUGMENTATION/);
  });
  it("uses synthetic identities only (242-555-01xx)", () => {
    for (const s of adaptations) {
      for (const m of s.turns.join(" ").matchAll(/\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g)) {
        expect(m[0].replace(/\D/g, "")).toMatch(/^(2425550\d{3}|8885430099)$/);
      }
    }
  });
});

const turn = (input: string, reply: string, bookingState = {}, actions: unknown[] = []) =>
  ({
    input,
    reply,
    bookingState,
    safetyOverride: false,
    handoffActive: false,
    actionsTaken: actions,
  }) as never;
const transcript = (turns: unknown[]): EvalTranscript =>
  ({
    scenarioId: "x",
    turns,
    finalState: {},
    allActions: (turns as { actionsTaken: unknown[] }[]).flatMap((t) => t.actionsTaken),
    finalHandoffActive: false,
  }) as never;
const booked = [
  { action: { type: "request_appointment", payload: {} }, result: { success: true } },
];
const base = adaptations[0];

describe("independent validators", () => {
  it("flags a booking made without a prior confirmation summary", () => {
    const f = runChecks(
      { ...base, expect: { outcome: "completed", bookings: 1 } },
      transcript([turn("yes", "ok", {}, booked)]),
    );
    expect(f.map((x) => x.check)).toContain("separate-confirmation");
  });
  it("flags repeated identical replies and lost details", () => {
    const f = runChecks(
      { ...base, expect: { outcome: "unresolved", bookings: 0 } },
      transcript([
        turn("a", "What day?", { intent: "book_appointment", name: "A" }),
        turn("b", "What day?", { intent: "book_appointment" }),
      ]),
    );
    const kinds = f.map((x) => x.check);
    expect(kinds).toContain("repeated-reply");
    expect(kinds).toContain("detail-loss");
  });
  it("flags unconfigured prices and false completion claims", () => {
    const f = runChecks(
      { ...base, expect: { outcome: "unresolved", bookings: 0 } },
      transcript([turn("hi", "You're all set, that will be $90.", {})]),
    );
    const kinds = f.map((x) => x.check);
    expect(kinds).toContain("unconfigured-price");
    expect(kinds).toContain("false-claim");
  });
  it("passes a clean confirmed booking", () => {
    const f = runChecks(
      { ...base, expect: { outcome: "completed", bookings: 1 } },
      transcript([
        turn("book", "Summary. Reply YES", {
          intent: "book_appointment",
          pendingAction: "confirm_booking",
        }),
        turn("yes", "Captured.", {}, booked),
      ]),
    );
    expect(f).toEqual([]);
  });
});
