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

import {
  injectionFor,
  pinClock,
  PINNED_NOW,
  type DriveTranscript,
} from "../../scripts/conversation-test/drive";
import { isConfirmationPrompt } from "../../scripts/conversation-test/checks";

const turn = (
  input: string,
  reply: string,
  bookingState = {},
  actions: unknown[] = [],
  scriptIndex?: number,
) =>
  ({
    input,
    reply,
    bookingState,
    safetyOverride: false,
    handoffActive: false,
    actionsTaken: actions,
    scriptIndex,
  }) as never;
const transcript = (turns: unknown[]): DriveTranscript =>
  ({
    scenarioId: "x",
    mode: "fixed",
    turns: (turns as { scriptIndex?: number }[]).map((t, i) => ({
      ...t,
      scriptIndex: t.scriptIndex ?? i,
    })),
    finalState: {},
    allActions: (turns as { actionsTaken: unknown[] }[]).flatMap((t) => t.actionsTaken),
    finalHandoffActive: false,
  }) as never;
const bookedWith = (payload: Record<string, unknown>) => [
  { action: { type: "request_appointment", payload }, result: { success: true } },
];
const GOOD = {
  name: "A B",
  phone: "+12425550100",
  service: "Routine cleaning",
  preferredDate: "Tuesday",
  preferredTime: "10:00",
};
const base = adaptations[0];
const expect1 = {
  ...base,
  expect: {
    outcome: "completed" as const,
    bookings: 1 as const,
    actions: [{ type: "request_appointment" as const, payload: GOOD }],
  },
};

describe("independent validators (provider-agnostic)", () => {
  it("accepts a confirmation by state (fallback) OR by wording (LLM prose) but not neither", () => {
    expect(isConfirmationPrompt("anything", { pendingAction: "confirm_booking" })).toBe(true);
    expect(
      isConfirmationPrompt(
        "I have you down for a cleaning Tuesday 10am. Shall I go ahead and book it?",
        {},
      ),
    ).toBe(true);
    expect(isConfirmationPrompt("What day works for you?", {})).toBe(false);
  });
  it("passes a clean booking confirmed via state AND one confirmed via prose only", () => {
    for (const [reply, state] of [
      ["Summary. Reply YES to confirm", { pendingAction: "confirm_booking" }],
      ["Is that correct?", {}],
    ] as const) {
      const f = runChecks(
        expect1,
        transcript([turn("book", reply, state), turn("yes", "Captured.", {}, bookedWith(GOOD))]),
      );
      expect(f).toEqual([]);
    }
  });
  it("flags a booking with no preceding confirmation prompt, or on a non-affirmative message", () => {
    const a = runChecks(
      expect1,
      transcript([turn("hi", "What day?", {}), turn("yes", "ok", {}, bookedWith(GOOD))]),
    );
    expect(a.map((x) => x.check)).toContain("separate-confirmation");
    const b = runChecks(
      expect1,
      transcript([
        turn("hi", "Reply YES to confirm", { pendingAction: "confirm_booking" }),
        turn("Tuesday please", "ok", {}, bookedWith(GOOD)),
      ]),
    );
    expect(b.map((x) => x.check)).toContain("separate-confirmation");
  });
  it("flags wrong booked data (junk name) and out-of-hours bookings as UNSAFE", () => {
    const f = runChecks(
      expect1,
      transcript([
        turn("x", "Reply YES to confirm", { pendingAction: "confirm_booking" }),
        turn("yes", "ok", {}, bookedWith({ ...GOOD, name: "Yes", preferredTime: "17:30" })),
      ]),
    );
    const unsafe = f.filter((x) => x.severity === "unsafe").map((x) => x.check);
    expect(unsafe).toContain("booking-payload");
    expect(unsafe).toContain("booking-outside-hours");
  });
  it("treats repeated replies / lost details as safe-incomplete, not unsafe; exempts staff handoff", () => {
    const f = runChecks(
      { ...base, expect: { outcome: "unresolved", bookings: 0 } },
      transcript([
        turn("a", "What day?", { intent: "book_appointment", name: "A" }),
        turn("b", "What day?", { intent: "book_appointment" }),
      ]),
    );
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.severity === "incomplete")).toBe(true);
  });
  it("flags unconfigured prices and false completion claims as unsafe", () => {
    const f = runChecks(
      { ...base, expect: { outcome: "unresolved", bookings: 0 } },
      transcript([turn("hi", "You're all set, that will be $90.", {})]),
    );
    expect(f.filter((x) => x.severity === "unsafe").map((x) => x.check)).toEqual(
      expect.arrayContaining(["unconfigured-price", "false-claim"]),
    );
  });
});

describe("bounded adaptive customer", () => {
  const sc = {
    ...base,
    expect: {
      outcome: "completed" as const,
      bookings: 1 as const,
      actions: [{ type: "request_appointment" as const, payload: GOOD }],
    },
  };
  it("answers a clarification with only an expected fact and never says yes", () => {
    const inj = injectionFor(
      sc,
      "What day and time works best for you?",
      {},
      ["yes"],
      new Map(),
      0,
    );
    expect(inj?.text).toBe("Tuesday 10am");
    expect(inj?.text).not.toMatch(/\byes\b/i);
  });
  it("does not inject on a confirmation prompt, when the next scripted turn already answers, or beyond the bounds", () => {
    expect(
      injectionFor(sc, "Reply YES to confirm the booking", {}, ["yes"], new Map(), 0),
    ).toBeNull();
    expect(
      injectionFor(sc, "What day and time works best for you?", {}, ["Tuesday 2pm"], new Map(), 0),
    ).toBeNull();
    expect(
      injectionFor(sc, "What day and time works best for you?", {}, ["yes"], new Map(), 3),
    ).toBeNull();
    expect(
      injectionFor(sc, "What day works best?", {}, ["yes"], new Map([["date", 2]]), 1),
    ).toBeNull();
  });
  it("leaves corrected fields to the script while a later turn still provides them", () => {
    const corrected = {
      ...sc,
      expect: { ...sc.expect, corrections: [{ turn: 3, fields: ["time" as const] }] },
    };
    expect(
      injectionFor(corrected, "What time works?", {}, ["yes", "actually 3pm"], new Map(), 0),
    ).toBeNull();
    expect(
      injectionFor(corrected, "What time works?", {}, ["yes", "thanks"], new Map(), 0)?.text,
    ).toBe("10am");
  });
  it("never injects for scenarios that expect no booking", () => {
    expect(
      injectionFor(
        { ...sc, expect: { outcome: "unresolved", bookings: 0 } },
        "What day works?",
        {},
        ["yes"],
        new Map(),
        0,
      ),
    ).toBeNull();
  });
});

describe("clock pin", () => {
  it("fixes Date to the reference instant and restores it", () => {
    const unpin = pinClock();
    try {
      expect(new Date().toISOString()).toBe(PINNED_NOW.toISOString());
      expect(Date.now()).toBe(PINNED_NOW.getTime());
      expect(new Date("2027-01-04T00:00:00Z").getUTCFullYear()).toBe(2027);
    } finally {
      unpin();
    }
    expect(Date.now()).not.toBe(PINNED_NOW.getTime());
  });
});
