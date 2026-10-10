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
import { bundlesCorrection, resolveCalendarDate } from "../../scripts/conversation-test/checks";

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

const FULL = {
  intent: "book_appointment" as const,
  name: "A B",
  phone: "+12425550100",
  service: "Routine cleaning",
  date: "Tuesday",
  time: "10:00",
};
const PROMPT =
  "I have you down for Routine cleaning on Tuesday, August 25 at 10:00 AM. Reply YES to confirm the booking.";

describe("calendar date resolution (frozen clock, America/Nassau)", () => {
  it("resolves weekdays on/after the pinned Thursday 2026-08-20 and passes ISO through", () => {
    expect(resolveCalendarDate("Thursday")).toBe("2026-08-20");
    expect(resolveCalendarDate("Tuesday")).toBe("2026-08-25");
    expect(resolveCalendarDate("monday")).toBe("2026-08-24");
    expect(resolveCalendarDate("2026-09-01")).toBe("2026-09-01");
    expect(resolveCalendarDate("someday")).toBeUndefined();
  });
  it("a weekday whose time has already passed today (11:00 Nassau) means next week", () => {
    expect(resolveCalendarDate("Thursday", "09:00")).toBe("2026-08-27");
    expect(resolveCalendarDate("Thursday", "11:00")).toBe("2026-08-27");
    expect(resolveCalendarDate("Thursday", "16:00")).toBe("2026-08-20");
  });
  it("uses the business timezone: 03:00Z on the 21st (UTC Friday) is still Thursday the 20th in Nassau", () => {
    expect(resolveCalendarDate("Friday", undefined, new Date("2026-08-21T03:00:00Z"))).toBe(
      "2026-08-21",
    );
    expect(resolveCalendarDate("Thursday", undefined, new Date("2026-08-21T03:00:00Z"))).toBe(
      "2026-08-20",
    );
  });
  it("matching weekday but a different calendar date is an UNSAFE booking-payload finding", () => {
    const f = runChecks(
      expect1,
      transcript([
        turn("x", PROMPT, FULL),
        turn("yes", "ok", {}, bookedWith({ ...GOOD, preferredDate: "2026-09-01" })),
      ]),
    );
    expect(f.find((x) => x.check === "booking-payload")?.detail).toMatch(/2026-09-01.*2026-08-25/);
  });
  it("an ISO date equal to the resolved weekday is accepted", () => {
    const f = runChecks(
      expect1,
      transcript([
        turn("x", PROMPT, { ...FULL, pendingAction: "confirm_booking" }),
        turn("yes", "ok", {}, bookedWith({ ...GOOD, preferredDate: "2026-08-25" })),
      ]),
    );
    expect(f).toEqual([]);
  });
});

describe("application-authorized confirmation (provider-agnostic)", () => {
  const armed = (pendingAction: "confirm_booking" | "confirm_service") => ({
    ...FULL,
    pendingAction,
  });
  it("accepts BOTH legitimate final-gate states with a pure approval", () => {
    for (const pa of ["confirm_booking", "confirm_service"] as const) {
      const f = runChecks(
        expect1,
        transcript([turn("x", PROMPT, armed(pa)), turn("yes", "Captured.", {}, bookedWith(GOOD))]),
      );
      expect(f).toEqual([]);
    }
  });
  it("rejects model prose alone (no armed state) even if it reads like a perfect summary", () => {
    const f = runChecks(
      expect1,
      transcript([turn("x", PROMPT, FULL), turn("yes", "ok", {}, bookedWith(GOOD))]),
    );
    expect(f.map((x) => x.check)).toContain("booking-authorization");
    expect(f.find((x) => x.check === "booking-authorization")?.detail).toMatch(/prose alone/);
  });
  it("rejects an early service question (armed but incomplete) as a final confirmation", () => {
    const f = runChecks(
      expect1,
      transcript([
        turn("x", "Would you like to book it?", {
          intent: "book_appointment",
          service: "Routine cleaning",
          pendingAction: "confirm_service",
        }),
        turn("yes", "ok", {}, bookedWith(GOOD)),
      ]),
    );
    expect(f.find((x) => x.check === "booking-authorization")?.detail).toMatch(/incomplete/);
  });
  it("rejects a prompt that does not display the exact stored details", () => {
    const f = runChecks(
      expect1,
      transcript([
        turn("x", "Reply YES to confirm the booking.", armed("confirm_booking")),
        turn("yes", "ok", {}, bookedWith(GOOD)),
      ]),
    );
    expect(f.find((x) => x.check === "booking-authorization")?.detail).toMatch(
      /exact stored details/,
    );
  });
  it("rejects an approval bundled with a material correction, and a payload that differs from what was shown", () => {
    const bundled = runChecks(
      expect1,
      transcript([
        turn("x", PROMPT, armed("confirm_booking")),
        turn("yes, make it 3pm", "ok", {}, bookedWith(GOOD)),
      ]),
    );
    expect(bundled.find((x) => x.check === "booking-authorization")?.detail).toMatch(/bundled/);
    const stale = runChecks(
      expect1,
      transcript([
        turn("x", PROMPT, armed("confirm_booking")),
        turn("yes", "ok", {}, bookedWith({ ...GOOD, preferredTime: "15:00" })),
      ]),
    );
    expect(stale.map((x) => x.detail).join(" ")).toMatch(/differs from the details/);
  });
  it("flags a FAILED attempt without authorization as unauthorized-attempt, and duplicate attempts", () => {
    const failed = [
      { action: { type: "request_appointment", payload: GOOD }, result: { success: false } },
    ];
    const f = runChecks(
      { ...expect1, expect: { outcome: "unresolved", bookings: 0 } },
      transcript([turn("hi", "What day?", {}, failed)]),
    );
    expect(f.map((x) => x.check)).toContain("unauthorized-attempt");
    const dup = runChecks(
      expect1,
      transcript([
        turn("x", PROMPT, armed("confirm_booking")),
        turn("yes", "ok", {}, bookedWith(GOOD)),
        turn("yes", "ok", {}, bookedWith(GOOD)),
      ]),
    );
    expect(dup.map((x) => x.check)).toContain("duplicate-attempts");
  });
  it("pure approvals pass; bundling detector is conservative", () => {
    for (const ok of [
      "yes",
      "Yes please",
      "ok please do",
      "Great! Please go ahead",
      "yes, that's right",
      "That is perfect",
    ])
      expect(bundlesCorrection(ok)).toBe(false);
    for (const bad of [
      "yes, make it 3pm",
      "yes. 242-555-0126",
      "yes but Wednesday",
      "ok, actually not 3pm",
    ])
      expect(bundlesCorrection(bad)).toBe(true);
  });
  it("treats repeated replies / lost details as safe-incomplete; flags unconfigured prices and false claims as unsafe", () => {
    const inc = runChecks(
      { ...base, expect: { outcome: "unresolved", bookings: 0 } },
      transcript([
        turn("a", "What day?", { intent: "book_appointment", name: "A" }),
        turn("b", "What day?", { intent: "book_appointment" }),
      ]),
    );
    expect(inc.length).toBeGreaterThan(0);
    expect(inc.every((x) => x.severity === "incomplete")).toBe(true);
    const bad = runChecks(
      { ...base, expect: { outcome: "unresolved", bookings: 0 } },
      transcript([turn("hi", "You're all set, that will be $90.", {})]),
    );
    expect(bad.filter((x) => x.severity === "unsafe").map((x) => x.check)).toEqual(
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
