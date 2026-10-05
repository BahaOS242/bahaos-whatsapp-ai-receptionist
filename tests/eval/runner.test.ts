import { describe, expect, it } from "vitest";
import { runScenario, runCorpus } from "../../scripts/eval/runner";
import type { EvalScenario } from "../../scripts/eval/types";
import type { AIProvider, AIProviderResponse } from "../../src/ai/types";

/** A scripted provider — no network, fully deterministic — so the runner
 * itself can be tested independent of any real receptionist logic. */
class ScriptedProvider implements AIProvider {
  private index = 0;
  constructor(private readonly script: AIProviderResponse[]) {}
  async generateResponse(): Promise<AIProviderResponse> {
    const response = this.script[this.index] ?? this.script[this.script.length - 1];
    this.index++;
    return response;
  }
}

describe("runScenario", () => {
  it("captures one turn record per message, in order, with the reply/state/actions the agent produced", async () => {
    const scenario: EvalScenario = {
      id: "TEST-01",
      category: "booking",
      description: "two-turn scripted scenario",
      turns: ["hello", "book me in"],
      expected: { outcome: "unresolved" },
    };
    const provider = new ScriptedProvider([
      { reply: "Hi there!", actions: [], bookingState: {} },
      {
        reply: "Sure — which service?",
        actions: [],
        bookingState: { intent: "book_appointment" },
      },
    ]);

    const transcript = await runScenario(scenario, { provider });

    expect(transcript.scenarioId).toBe("TEST-01");
    expect(transcript.turns).toHaveLength(2);
    expect(transcript.turns[0]).toMatchObject({ input: "hello", reply: "Hi there!" });
    expect(transcript.turns[1]).toMatchObject({
      input: "book me in",
      reply: "Sure — which service?",
      bookingState: { intent: "book_appointment" },
    });
    expect(transcript.finalState).toEqual({ intent: "book_appointment" });
  });

  it("flattens actionsTaken across every turn into allActions, in order", async () => {
    const scenario: EvalScenario = {
      id: "TEST-02",
      category: "booking",
      description: "two actions across two turns",
      turns: ["a", "b"],
      expected: { outcome: "completed" },
    };
    const provider = new ScriptedProvider([
      {
        reply: "r1",
        actions: [{ type: "create_lead", payload: { name: "X" } }],
        bookingState: {},
      },
      {
        reply: "r2",
        actions: [{ type: "escalate", payload: { reason: "test" } }],
        bookingState: {},
      },
    ]);

    const transcript = await runScenario(scenario, { provider });

    expect(transcript.allActions.map((a) => a.action.type)).toEqual(["create_lead", "escalate"]);
  });

  it("an empty-turns scenario produces an empty transcript with a fresh finalState, not a crash", async () => {
    const scenario: EvalScenario = {
      id: "TEST-03",
      category: "booking",
      description: "no turns",
      turns: [],
      expected: { outcome: "unresolved" },
    };

    const transcript = await runScenario(scenario, { provider: new ScriptedProvider([]) });

    expect(transcript.turns).toEqual([]);
    expect(transcript.finalState).toEqual({});
    expect(transcript.allActions).toEqual([]);
    expect(transcript.finalHandoffActive).toBe(false);
  });

  it("runCorpus gives each scenario a fresh, independent conversation — state never leaks between scenarios", async () => {
    const scenarios: EvalScenario[] = [
      {
        id: "A",
        category: "booking",
        description: "sets state",
        turns: ["x"],
        expected: { outcome: "unresolved" },
      },
      {
        id: "B",
        category: "booking",
        description: "should not see A's state",
        turns: ["y"],
        expected: { outcome: "unresolved" },
      },
    ];

    const transcripts = await runCorpus(scenarios, {
      providerFactory: () =>
        new ScriptedProvider([
          {
            reply: "ok",
            actions: [],
            bookingState: { intent: "book_appointment", name: "Leaked" },
          },
        ]),
    });

    // Both scenarios use a FRESH ConversationManager (starts at {}), so
    // scenario B's request going in still has bookingState: {} regardless
    // of what A's transcript ended up with.
    expect(transcripts[0].finalState).toEqual({ intent: "book_appointment", name: "Leaked" });
    expect(transcripts[1].finalState).toEqual({ intent: "book_appointment", name: "Leaked" });
    expect(transcripts).toHaveLength(2);
  });
});
