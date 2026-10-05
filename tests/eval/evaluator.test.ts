import { describe, expect, it } from "vitest";
import { deriveActualOutcome, evaluateScenario } from "../../scripts/eval/evaluator";
import type { EvalScenario, EvalTranscript, EvalTurnRecord } from "../../scripts/eval/types";
import type { ExecutedAction, RequestAppointmentPayload } from "../../src/ai/types";

/** Builds a minimal, valid turn record with sensible defaults, so each
 * test only has to specify what it actually cares about. */
function turn(overrides: Partial<EvalTurnRecord>): EvalTurnRecord {
  return {
    input: "message",
    reply: "reply",
    bookingState: {},
    safetyOverride: false,
    handoffActive: false,
    actionsTaken: [],
    ...overrides,
  };
}

function transcript(
  turns: EvalTurnRecord[],
  overrides: Partial<EvalTranscript> = {},
): EvalTranscript {
  const last = turns[turns.length - 1];
  return {
    scenarioId: "TEST",
    turns,
    finalState: last?.bookingState ?? {},
    allActions: turns.flatMap((t) => t.actionsTaken),
    finalHandoffActive: last?.handoffActive ?? false,
    ...overrides,
  };
}

function scenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "TEST",
    category: "booking",
    description: "test scenario",
    turns: [],
    expected: { outcome: "unresolved" },
    ...overrides,
  };
}

const REQUEST_APPOINTMENT_ACTION = (
  overrides: Partial<RequestAppointmentPayload> = {},
): ExecutedAction => ({
  action: {
    type: "request_appointment",
    payload: {
      name: "Trevor",
      phone: "+12428012847",
      service: "Routine cleaning",
      preferredDate: "Tuesday",
      preferredTime: "14:00",
      ...overrides,
    },
  },
  result: { success: true },
});

describe("deriveActualOutcome", () => {
  it("completed: a successful completing action occurred", () => {
    const t = transcript([
      turn({ bookingState: {}, actionsTaken: [REQUEST_APPOINTMENT_ACTION()] }),
    ]);
    expect(deriveActualOutcome(t)).toBe("completed");
  });

  it("escalated: handoff is active at the end", () => {
    const t = transcript([turn({ handoffActive: true, bookingState: {} })]);
    expect(deriveActualOutcome(t)).toBe("escalated");
  });

  it("abandoned: intent was engaged, then cleared, with no completion or escalation", () => {
    const t = transcript([
      turn({ bookingState: { intent: "book_appointment", service: "Routine cleaning" } }),
      turn({ bookingState: {} }),
    ]);
    expect(deriveActualOutcome(t)).toBe("abandoned");
  });

  it("unresolved: intent is still set, mid-flow", () => {
    const t = transcript([
      turn({ bookingState: { intent: "book_appointment", service: "Routine cleaning" } }),
    ]);
    expect(deriveActualOutcome(t)).toBe("unresolved");
  });

  it("unresolved: nothing was ever engaged at all (e.g. a pure FAQ exchange)", () => {
    const t = transcript([turn({ bookingState: {} })]);
    expect(deriveActualOutcome(t)).toBe("unresolved");
  });
});

describe("evaluateScenario — intent dimension", () => {
  it("passes when the achieved intent (from a completing action) matches expected", () => {
    const s = scenario({ expected: { outcome: "completed", intent: "book_appointment" } });
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    const result = evaluateScenario(s, t);
    expect(result.dimensions.find((d) => d.dimension === "intent")).toMatchObject({
      applicable: true,
      passed: true,
    });
  });

  it("fails when the achieved intent doesn't match, and reports both values", () => {
    const s = scenario({ expected: { outcome: "completed", intent: "cancel_appointment" } });
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "intent")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(
      /expected intent "cancel_appointment", achieved "book_appointment"/,
    );
  });

  it("is inapplicable (and never fails the scenario) when no intent is expected", () => {
    const s = scenario({ expected: { outcome: "unresolved" } });
    const t = transcript([turn({ bookingState: {} })]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "intent")!;
    expect(dim.applicable).toBe(false);
    expect(dim.passed).toBe(true);
  });
});

describe("evaluateScenario — state dimension", () => {
  it("fails when a specific expected field doesn't match the actual final state", () => {
    const s = scenario({
      expected: { outcome: "unresolved", finalState: { service: "Basic filling" } },
    });
    const t = transcript([
      turn({ bookingState: { intent: "book_appointment", service: "Routine cleaning" } }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "state")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/finalState\.service/);
  });
});

describe("evaluateScenario — business_rules dimension", () => {
  it("fails when a successful request_appointment action has an out-of-hours payload", () => {
    const s = scenario();
    const t = transcript([
      turn({
        actionsTaken: [REQUEST_APPOINTMENT_ACTION({ preferredTime: "18:00" })], // after 5pm close
      }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "business_rules")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/out-of-hours/);
  });

  it("passes for a genuinely valid appointment payload", () => {
    const s = scenario();
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "business_rules")!;
    expect(dim.passed).toBe(true);
  });
});

describe("evaluateScenario — tool_safety dimension", () => {
  it("fails when a prohibited action type appears anywhere in the transcript", () => {
    const s = scenario({
      expected: { outcome: "invalid", prohibitedActions: ["request_appointment"] },
    });
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "tool_safety")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/prohibited action/);
  });

  it("fails when an expected action's payload subset doesn't match", () => {
    const s = scenario({
      expected: {
        outcome: "completed",
        actions: [{ type: "request_appointment", payload: { service: "Basic filling" } }],
      },
    });
    const t = transcript([
      turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION({ service: "Routine cleaning" })] }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "tool_safety")!;
    expect(dim.passed).toBe(false);
  });

  it("fails when more than one completing action succeeds in one conversation (duplicate-booking risk)", () => {
    const s = scenario();
    const t = transcript([
      turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] }),
      turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "tool_safety")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/duplicate-booking risk/);
  });

  it("passes when expected actions appear in order and nothing prohibited occurs", () => {
    const s = scenario({
      expected: {
        outcome: "completed",
        actions: [{ type: "request_appointment", payload: { service: "Routine cleaning" } }],
        prohibitedActions: ["escalate"],
      },
    });
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "tool_safety")!;
    expect(dim.passed).toBe(true);
  });
});

describe("evaluateScenario — flow dimension", () => {
  it("fails when a reply re-asks for a field bookingState already has", () => {
    const s = scenario();
    const t = transcript([
      turn({
        reply: "Could I get your name?",
        bookingState: { intent: "book_appointment", name: "Trevor" },
      }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "flow")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/re-asks for "name"/);
  });

  it("fails when name/phone are asked for while holding an invalid (out-of-hours) date/time", () => {
    const s = scenario();
    const t = transcript([
      turn({
        reply: "Could I get your name and phone number?",
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "18:00", // after close — should never have reached this point
        },
      }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "flow")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/invalid date\/time/);
  });

  it("passes for a normal, non-repeating flow turn", () => {
    const s = scenario();
    const t = transcript([
      turn({
        reply: "And the best phone number to reach you?",
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          date: "Tuesday",
          time: "14:00",
          name: "Trevor",
        },
      }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "flow")!;
    expect(dim.passed).toBe(true);
  });
});

describe("evaluateScenario — recovery dimension", () => {
  it("fails when a captured field silently disappears while intent is still active", () => {
    const s = scenario();
    const t = transcript([
      turn({
        bookingState: { intent: "book_appointment", service: "Routine cleaning", name: "Trevor" },
      }),
      turn({ bookingState: { intent: "book_appointment", service: "Routine cleaning" } }), // name lost
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "recovery")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/name.*was "Trevor".*now missing/);
  });

  it("does NOT flag a field disappearing when the whole flow resets (abandon/complete)", () => {
    const s = scenario();
    const t = transcript([
      turn({
        bookingState: { intent: "book_appointment", service: "Routine cleaning", name: "Trevor" },
      }),
      turn({ bookingState: {} }), // full reset — fine
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "recovery")!;
    expect(dim.passed).toBe(true);
  });

  it("does NOT flag the same question being re-asked when nothing was actually lost (the old false-positive this replaced)", () => {
    const s = scenario();
    const t = transcript([
      turn({
        input: "yes",
        reply: "What day and time works best for you?",
        bookingState: { intent: "book_appointment", service: "Routine cleaning" },
      }),
      turn({
        input: "Trevor 2428012847",
        reply: "What day and time works best for you?",
        bookingState: {
          intent: "book_appointment",
          service: "Routine cleaning",
          name: "Trevor",
          phone: "+12428012847",
        },
      }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "recovery")!;
    expect(dim.passed).toBe(true);
  });

  it("is inapplicable for a single-turn scenario", () => {
    const s = scenario();
    const t = transcript([turn({})]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "recovery")!;
    expect(dim.applicable).toBe(false);
  });
});

describe("evaluateScenario — escalation dimension", () => {
  it("fails when escalation was expected but no successful escalate action occurred", () => {
    const s = scenario({ expected: { outcome: "escalated" } });
    const t = transcript([turn({ bookingState: {} })]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "escalation")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/no successful escalate action/);
  });

  it("fails when an automated action executes on a turn AFTER escalation", () => {
    const s = scenario({ expected: { outcome: "escalated" } });
    const t = transcript([
      turn({
        actionsTaken: [
          { action: { type: "escalate", payload: { reason: "x" } }, result: { success: true } },
        ],
      }),
      turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "escalation")!;
    expect(dim.passed).toBe(false);
    expect(dim.details[0]).toMatch(/AFTER escalation/);
  });

  it("passes when escalation occurred and nothing automated followed", () => {
    const s = scenario({ expected: { outcome: "escalated" } });
    const t = transcript([
      turn({
        actionsTaken: [
          { action: { type: "escalate", payload: { reason: "x" } }, result: { success: true } },
        ],
      }),
      turn({ actionsTaken: [] }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "escalation")!;
    expect(dim.passed).toBe(true);
  });
});

describe("evaluateScenario — resolution dimension", () => {
  it('treats expected "invalid" as compatible with actual "unresolved" (documented equivalence)', () => {
    const s = scenario({ expected: { outcome: "invalid" } });
    const t = transcript([
      turn({ bookingState: { intent: "book_appointment", service: "Routine cleaning" } }),
    ]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "resolution")!;
    expect(dim.passed).toBe(true);
  });

  it('does NOT treat expected "invalid" as compatible with actual "completed"', () => {
    const s = scenario({ expected: { outcome: "invalid" } });
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    const dim = evaluateScenario(s, t).dimensions.find((d) => d.dimension === "resolution")!;
    expect(dim.passed).toBe(false);
  });
});

describe("evaluateScenario — overallPassed", () => {
  it("is true only when every APPLICABLE dimension passes", () => {
    const s = scenario({ expected: { outcome: "completed", intent: "book_appointment" } });
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    expect(evaluateScenario(s, t).overallPassed).toBe(true);
  });

  it("is false when even one applicable dimension fails", () => {
    const s = scenario({ expected: { outcome: "completed", intent: "cancel_appointment" } });
    const t = transcript([turn({ actionsTaken: [REQUEST_APPOINTMENT_ACTION()] })]);
    expect(evaluateScenario(s, t).overallPassed).toBe(false);
  });
});
