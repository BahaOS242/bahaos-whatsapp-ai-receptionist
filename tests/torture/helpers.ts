import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { LlmChatClient, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import type {
  AIProvider,
  BookingState,
  ConversationTurn,
  CustomerContext,
  ExecutedAction,
} from "../../src/ai/types";

/**
 * Shared harness for the torture suite. Drives a full multi-turn
 * conversation through the REAL ReceptionistAgent + ConversationManager
 * plumbing (the same stack scripts/dev-chat.ts and production use) — not
 * a shortcut that calls a provider directly — so what we observe here is
 * exactly what a real customer would experience on WhatsApp.
 *
 * Every turn is recorded with its full state, not just the reply text,
 * because the goal of this suite is specifically to catch "the AI said
 * the right thing but stored the wrong state" — a passing-looking reply
 * with corrupted BookingState underneath is exactly the failure mode a
 * reply-only assertion would miss.
 */
export interface Turn {
  input: string;
  reply: string;
  bookingState: BookingState;
  safetyOverride: boolean;
  actionsTaken: ExecutedAction[];
  escalated: boolean;
  /** Whether the conversation is in a staff-handoff state AFTER this
   * turn — see ReceptionistAgentResult.handoffActive. */
  handoffActive: boolean;
}

export class TortureConversation {
  readonly turns: Turn[] = [];
  private readonly manager = new ConversationManager();
  private history: ConversationTurn[] = [];

  constructor(
    private readonly agent: ReceptionistAgent,
    private readonly customer: CustomerContext = {},
    seedBookingState: BookingState = {},
  ) {
    this.manager.setBookingState(seedBookingState);
  }

  async say(message: string): Promise<Turn> {
    const request = this.manager.buildRequest({
      business: BAHAMAS_DENTAL_SERVICE,
      customer: this.customer,
      history: this.history,
      message,
    });
    const result = await this.agent.handleMessage(request);

    this.history.push({ role: "customer", content: message });
    this.history.push({ role: "assistant", content: result.reply });
    this.manager.setBookingState(result.bookingState);
    this.manager.setHandoffActive(result.handoffActive);

    const turn: Turn = {
      input: message,
      reply: result.reply,
      bookingState: result.bookingState,
      safetyOverride: result.safetyOverride,
      actionsTaken: result.actionsTaken,
      escalated: result.actionsTaken.some((a) => a.action.type === "escalate" && a.result.success),
      handoffActive: result.handoffActive,
    };
    this.turns.push(turn);
    return turn;
  }

  /** Runs several messages back to back and returns every turn recorded,
   * for scenarios that just need "say these things in order" without
   * inspecting intermediate turns. */
  async sayAll(messages: string[]): Promise<Turn[]> {
    for (const message of messages) await this.say(message);
    return this.turns;
  }

  get last(): Turn {
    return this.turns[this.turns.length - 1];
  }
}

/** The primary provider under test: no network, fully deterministic —
 * every scenario in this suite runs against this by default. */
export function devConversation(
  customer: CustomerContext = {},
  seedBookingState: BookingState = {},
): TortureConversation {
  const provider = new DevRuleBasedAIProvider();
  const tools = createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);
  const agent = new ReceptionistAgent(provider, tools);
  return new TortureConversation(agent, customer, seedBookingState);
}

/** A LlmChatClient double that plays back a fixed script of responses, one
 * per call — standing in for "what a well-behaved real model would say"
 * so LLMProvider's OWN surrounding logic (hours authority, state
 * derivation, pendingAction plumbing, malformed-response handling) can be
 * torture-tested without live API credentials. This does not, and cannot,
 * test the model's actual language understanding — that requires a live
 * model. It tests everything the application controls around the model. */
export class ScriptedLlmChatClient implements LlmChatClient {
  private index = 0;
  public readonly calls: Parameters<LlmChatClient["chat"]>[0][] = [];

  constructor(private readonly script: LlmChatResult[]) {}

  async chat(params: Parameters<LlmChatClient["chat"]>[0]): Promise<LlmChatResult> {
    this.calls.push(params);
    const result = this.script[this.index] ?? this.script[this.script.length - 1];
    this.index++;
    return result;
  }
}

export function llmConversation(
  script: LlmChatResult[],
  customer: CustomerContext = {},
  seedBookingState: BookingState = {},
): { conversation: TortureConversation; client: ScriptedLlmChatClient } {
  const client = new ScriptedLlmChatClient(script);
  const provider = new LLMProvider(client);
  const tools = createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);
  const agent = new ReceptionistAgent(provider, tools);
  return { conversation: new TortureConversation(agent, customer, seedBookingState), client };
}

/** For scenarios that want a specific provider instance not covered by
 * the two helpers above. */
export function conversationWith(
  provider: AIProvider,
  customer: CustomerContext = {},
  seedBookingState: BookingState = {},
): TortureConversation {
  const tools = createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE);
  const agent = new ReceptionistAgent(provider, tools);
  return new TortureConversation(agent, customer, seedBookingState);
}
