import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { nextRequiredField } from "../../src/ai/booking-progression";
import { ObservingAnthropicChatClient, ObservingOpenRouterChatClient } from "./observing-clients";
import type { ObservedCall } from "./observing-clients";
import type { DeterministicScenario } from "../../tests/ai/fixtures/deterministic-scenarios";
import type { Env } from "../../src/config/env";
import type { BookingState, ConversationTurn, ExecutedAction } from "../../src/ai/types";

/**
 * Drives one DeterministicScenario through the REAL ReceptionistAgent +
 * ConversationManager + LLMProvider stack — identical to how
 * tests/ai/deterministic-scenario-eval.test.ts drives it, except the
 * LlmChatClient is a real Anthropic/OpenRouter client (via
 * observing-clients.ts) instead of ScriptedLlmChatClient. Nothing here
 * touches ConversationManager/ReceptionistAgent/LLMProvider — this is
 * purely a caller, exactly the shape scripts/dev-chat.ts and the test
 * suite already use.
 */

export type ProviderName = "anthropic" | "openrouter";

export interface TurnRecord {
  index: number;
  message: string;
  reply: string;
  nextRequiredFieldBefore: string | undefined;
  bookingStateBefore: BookingState;
  bookingStateAfter: BookingState;
  nextRequiredFieldAfter: string | undefined;
  actionsTaken: ExecutedAction[];
  handoffActive: boolean;
  safetyOverride: boolean;
  /** False when this turn was handled entirely by a deterministic safety
   * net (auto-confirm bypass, decline bypass, or the handoff short-
   * circuit) and never reached the model at all. */
  modelCalled: boolean;
  modelRequested?: string;
  modelUsed?: string;
  latencyMs?: number;
  apiError?: string;
}

export interface ScenarioRun {
  scenarioId: number;
  title: string;
  provider: ProviderName;
  modelRequested: string;
  messages: string[];
  turns: TurnRecord[];
  finalBookingState: BookingState;
  finalHandoffActive: boolean;
  modelsUsed: string[];
  totalLatencyMs: number;
  avgLatencyMs: number;
}

function buildObservingClient(provider: ProviderName, env: Env) {
  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    return {
      client: new ObservingAnthropicChatClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL),
      modelRequested: env.ANTHROPIC_MODEL,
    };
  }
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
  return {
    client: new ObservingOpenRouterChatClient(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL),
    modelRequested: env.OPENROUTER_MODEL,
  };
}

export async function runScenarioLive(
  scenario: DeterministicScenario,
  provider: ProviderName,
  env: Env,
): Promise<ScenarioRun> {
  const business = scenario.business ?? BAHAMAS_DENTAL_SERVICE;
  const { client, modelRequested } = buildObservingClient(provider, env);
  const agent = new ReceptionistAgent(new LLMProvider(client), createSimulatedReceptionistTools(business));
  const manager = new ConversationManager();
  const history: ConversationTurn[] = [];
  const turns: TurnRecord[] = [];

  for (let i = 0; i < scenario.messages.length; i++) {
    const message = scenario.messages[i];
    const bookingStateBefore = manager.getBookingState();
    const nextRequiredFieldBefore = nextRequiredField(bookingStateBefore);
    const callsBefore = client.calls.length;

    const request = manager.buildRequest({ business, customer: {}, history, message });
    const result = await agent.handleMessage(request);

    const newCalls: ObservedCall[] = client.calls.slice(callsBefore);
    const lastCall = newCalls[newCalls.length - 1];

    turns.push({
      index: i,
      message,
      reply: result.reply,
      nextRequiredFieldBefore,
      bookingStateBefore,
      bookingStateAfter: result.bookingState,
      nextRequiredFieldAfter: nextRequiredField(result.bookingState),
      actionsTaken: result.actionsTaken,
      handoffActive: result.handoffActive,
      safetyOverride: result.safetyOverride,
      modelCalled: newCalls.length > 0,
      modelRequested: newCalls.length > 0 ? modelRequested : undefined,
      modelUsed: lastCall?.model,
      latencyMs: lastCall?.latencyMs,
      apiError: lastCall?.error,
    });

    history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
    manager.setBookingState(result.bookingState);
    manager.setHandoffActive(result.handoffActive);
  }

  const modelsUsed = Array.from(
    new Set(client.calls.map((c) => c.model).filter((m): m is string => Boolean(m))),
  );
  const latencies = client.calls.map((c) => c.latencyMs);
  const totalLatencyMs = latencies.reduce((sum, ms) => sum + ms, 0);
  const lastTurn = turns[turns.length - 1];

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    provider,
    modelRequested,
    messages: scenario.messages,
    turns,
    finalBookingState: lastTurn?.bookingStateAfter ?? {},
    finalHandoffActive: lastTurn?.handoffActive ?? false,
    modelsUsed,
    totalLatencyMs,
    avgLatencyMs: latencies.length > 0 ? totalLatencyMs / latencies.length : 0,
  };
}
