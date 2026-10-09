import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "../../src/ai/providers/llm-chat-client";
import { RECEPTIONIST_TOOL_DEFINITIONS } from "../../src/ai/providers/tool-definitions";
import { BudgetExceeded, Ledger, MAX_OUTPUT_TOKENS } from "./config";

/** The slice of the Anthropic SDK this harness uses — injectable so every control is testable with NO network. */
export interface MessagesSdk {
  messages: { countTokens(body: Record<string, unknown>): Promise<{ input_tokens?: unknown }>; create(body: Record<string, unknown>): Promise<{ model: string; content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; usage?: { input_tokens?: unknown; output_tokens?: unknown } }> };
}

const TOOLS = RECEPTIONIST_TOOL_DEFINITIONS.filter((t): t is Extract<typeof t, { type: "function" }> => t.type === "function").map((t) => ({
  name: t.function.name, description: t.function.description, input_schema: t.function.parameters,
}));

/** Same request mapping as the production AnthropicChatClient, plus a pre-call budget gate and usage accounting. */
export class CappedClient implements LlmChatClient {
  readonly modelsSeen = new Set<string>();
  constructor(private readonly sdk: MessagesSdk, private readonly ledger: Ledger) {}

  async chat(p: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const body = { model: this.ledger.cfg.model, system: p.systemPrompt, messages: p.messages.map((m) => ({ role: m.role, content: m.content })), tools: TOOLS };
    // AUTHORITATIVE pre-call input count (provider's free count_tokens endpoint) for the exact request.
    let counted: unknown;
    try { counted = (await this.sdk.messages.countTokens(body)).input_tokens; } catch { counted = undefined; }
    const worst = this.ledger.gate(counted);
    const input = counted as number;
    let r;
    try {
      r = await this.sdk.messages.create({ ...body, max_tokens: MAX_OUTPUT_TOKENS });
    } catch (e) {
      this.ledger.failed(worst, e instanceof Error ? e.name : "unknown");
      throw new BudgetExceeded(this.ledger.haltedReason!); // halts the whole run: an uncertain-usage failure is never retried
    }
    this.ledger.settle(r.usage, input, worst);
    this.modelsSeen.add(r.model);
    const text = r.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    const toolCalls = r.content.filter((b) => b.type === "tool_use").map((b) => ({ id: String(b.id), name: String(b.name), argumentsJson: JSON.stringify(b.input) }));
    return { content: text.length ? text : null, toolCalls };
  }
}
