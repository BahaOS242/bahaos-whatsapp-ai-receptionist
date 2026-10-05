import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { AIProvider, BusinessContext, ConversationTurn } from "../../src/ai/types";
import type { EvalScenario, EvalTranscript, EvalTurnRecord } from "./types";

/**
 * Conversation Runner — drives one scenario through the REAL production
 * stack (ConversationManager + ReceptionistAgent + a provider + the
 * simulated ReceptionistTools), the exact same combination
 * scripts/dev-chat.ts and tests/torture/helpers.ts already use, and
 * captures the full transcript. This module never modifies production
 * behavior — it only calls existing public exports.
 */
export async function runScenario(
  scenario: EvalScenario,
  options: { business?: BusinessContext; provider?: AIProvider } = {},
): Promise<EvalTranscript> {
  const business = options.business ?? BAHAMAS_DENTAL_SERVICE;
  const provider = options.provider ?? new DevRuleBasedAIProvider();
  const tools = createSimulatedReceptionistTools(business);
  const agent = new ReceptionistAgent(provider, tools);
  const manager = new ConversationManager();
  const history: ConversationTurn[] = [];
  const turns: EvalTurnRecord[] = [];

  for (const message of scenario.turns) {
    const request = manager.buildRequest({ business, customer: {}, history, message });
    const result = await agent.handleMessage(request);

    turns.push({
      input: message,
      reply: result.reply,
      bookingState: result.bookingState,
      safetyOverride: result.safetyOverride,
      handoffActive: result.handoffActive,
      actionsTaken: result.actionsTaken,
    });

    history.push(
      { role: "customer", content: message },
      { role: "assistant", content: result.reply },
    );
    manager.setBookingState(result.bookingState);
    manager.setHandoffActive(result.handoffActive);
  }

  const lastTurn = turns[turns.length - 1];
  return {
    scenarioId: scenario.id,
    turns,
    finalState: lastTurn?.bookingState ?? {},
    allActions: turns.flatMap((t) => t.actionsTaken),
    finalHandoffActive: lastTurn?.handoffActive ?? false,
  };
}

/** Runs every scenario in a corpus, each with its own fresh conversation
 * (never shares state across scenarios). `providerFactory`, when given,
 * is called once per scenario so a stateful provider (a
 * ScriptedLlmChatClient-backed one, say) never leaks state between
 * scenarios either. */
export async function runCorpus(
  scenarios: EvalScenario[],
  options: { business?: BusinessContext; providerFactory?: () => AIProvider } = {},
): Promise<EvalTranscript[]> {
  const results: EvalTranscript[] = [];
  for (const scenario of scenarios) {
    results.push(
      await runScenario(scenario, {
        business: options.business,
        provider: options.providerFactory?.(),
      }),
    );
  }
  return results;
}
