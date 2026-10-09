import { afterEach, describe, expect, it } from "vitest";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { agentFromClient, restoreClock, runCase } from "../../scripts/live-eval/harness";
import { FOCUSED_LABEL, FOCUSED_R21_R22 } from "../../scripts/live-eval/focused-r21-r22";
import type { AIProvider, AIProviderResponse } from "../../src/ai/types";
import { ScriptedLlmChatClient } from "../torture/helpers";

afterEach(() => restoreClock());

describe("FOCUSED R21/R22 set (structure)", () => {
  it("10 cases, strict: single separate approval, no retry, exact payload expectations", () => {
    expect(FOCUSED_R21_R22).toHaveLength(10);
    expect(FOCUSED_LABEL).toMatch(/new run/);
    for (const c of FOCUSED_R21_R22) {
      expect(c.approvals).toEqual(["yes"]);
      expect(c.retryApproval).toBeUndefined();
      expect(c.expectBookings).toBe("exactlyOne");
      expect(c.checkAfterSetup?.[4]).toBeTypeOf("function");
      expect(c.setup).toHaveLength(5); // the correction is the LAST setup turn → a booking on it is a hard failure
    }
    const ids = FOCUSED_R21_R22.map((c) => c.id).join("|");
    expect(ids).toMatch(/yes, Alisha not Alicia/);
    expect(ids).toMatch(/curly It’s Alisha/);
    expect(ids).toMatch(/bundled yes/);
  });
  it("includes a curly apostrophe and a bundled 'yes' for BOTH name and phone corrections", () => {
    const text = FOCUSED_R21_R22.flatMap((c) => c.setup).join("\n");
    expect(text).toContain("It’s Alisha");
    expect(text).toContain("yes, Alisha not Alicia");
    expect(text).toContain("wrong number, it’s 2428019999");
    expect(text).toContain("yes, wrong number, it's 2428019999");
  });
});

// Free offline smoke of the focused oracle: fallback provider and scripted-LLM (fake model that never books) — zero hard failures.
describe("focused cases pass the strict oracle offline (fallback provider)", () => {
  const agent = () => new ReceptionistAgent(new DevRuleBasedAIProvider(), createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE));
  for (const c of FOCUSED_R21_R22) {
    it(c.id, async () => {
      const r = await runCase(c, 1, agent(), () => null);
      expect(r.hard, JSON.stringify(r.steps.map((s) => [s.in, s.state]))).toEqual([]);
      expect(r.soft).toEqual([]);
      expect(r.successfulBookings).toBe(1);
      expect(r.steps.filter((s) => s.kind === "approval")).toHaveLength(1);
      expect(r.steps[4].actions.filter((a) => a.type === "request_appointment")).toHaveLength(0);
    });
  }
});

describe("the strict oracle catches a provider that books on the correction turn", () => {
  it("injected provider books the OLD name on the correction turn (turn 5) → hard failure", async () => {
    let turn = 0;
    const provider: AIProvider = {
      async generateResponse(req): Promise<AIProviderResponse> {
        turn++;
        return { reply: "ok", bookingState: req.bookingState, actions: turn === 5 ? [{ type: "request_appointment", payload: { name: "Alicia", phone: "+12425550100", service: "Routine cleaning", preferredDate: "Tuesday", preferredTime: "14:00" } }] : [] };
      },
    };
    const agent = new ReceptionistAgent(provider, createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE));
    const r = await runCase(FOCUSED_R21_R22[1], 1, agent, () => null);
    expect(r.hard.join(" ")).toMatch(/setup turn 5 .* BEFORE the explicit approval/);
  });
  it("a scripted LLM that tries to book on the correction turn is stopped by the APPLICATION (no booking is executed on that turn)", async () => {
    const script = Array.from({ length: 8 }, () => ({ content: "ok", toolCalls: [] as never[] }));
    script[4] = { content: "Booked.", toolCalls: [{ id: "x", name: "request_appointment", argumentsJson: JSON.stringify({ name: "Alicia", phone: "+12425550100", service: "Routine cleaning", preferredDate: "Tuesday", preferredTime: "14:00" }) }] as never };
    const r = await runCase(FOCUSED_R21_R22[1], 1, agentFromClient(new ScriptedLlmChatClient(script)), () => null);
    expect(r.steps[4].actions.filter((a) => a.type === "request_appointment" && a.success)).toHaveLength(0);
  });
});
