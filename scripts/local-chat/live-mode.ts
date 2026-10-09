/**
 * "Live Haiku / simulated bookings" for the LOCAL test chat. Real model calls, but bookings stay on the in-memory
 * simulated tools (see local-chat-app.ts). Spend is controlled SERVER-side with the same mechanism as the approved live
 * evaluation (scripts/live-eval): an AUTHORITATIVE token count (the provider's free count_tokens endpoint) before every
 * request, the FULL max-output reservation, refusal when the next call could exceed the budget, and a halt on any unknown
 * usage or failed request. One global gate serialises every live call, so concurrent tabs/conversations cannot overspend.
 *
 * This is the ONLY file in the local chat that knows the Anthropic key or imports the SDK. The key is read once, held in a
 * closure, and never put in a response, a page asset or a log line. Figures are ESTIMATES (usage x a price snapshot), not
 * billing receipts.
 */
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { parse as parseDotenv } from "dotenv";
import { CappedClient, type MessagesSdk } from "../live-eval/capped-client";
import { APPROVED_MODELS, Ledger, PRICE_SNAPSHOTS } from "../live-eval/config";
import type { LlmChatClient, LlmChatMessage, LlmChatResult } from "../../src/ai/providers/llm-chat-client";

/** The most this tool may ever be authorised to spend per server session. */
export const LIVE_BUDGET_CAP_USD = 1;
/** Soft stop at 95% of the budget: a refusal happens before the estimate (not a receipt) can reach the cap. */
const STOP_FRACTION = 0.95;
export const LIVE_LABEL = "Live Haiku / simulated bookings";
const LIVE_MODEL = APPROVED_MODELS[0];

export interface LiveSnapshot {
  available: true;
  label: string;
  model: string;
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  halted: string | null;
  /** Always true: derived from reported usage x a price snapshot, not a billing receipt. */
  estimate: true;
}

export interface LiveSession {
  /** The spend-gated client every live conversation must use. */
  client: LlmChatClient;
  snapshot(): LiveSnapshot;
  isHalted(): string | null;
}

export function redactSecrets(text: string, key?: string): string {
  let s = text;
  if (key) s = s.split(key).join("[REDACTED]");
  return s.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "[REDACTED]");
}

/**
 * Reads ONLY ANTHROPIC_API_KEY: from the given process environment if set there, otherwise from the `.env` file by parsing it
 * (nothing is exported to process.env and no other variable is read or kept).
 */
export function readAnthropicKey(opts: { envFile?: string; processEnv?: Record<string, string | undefined> } = {}): string | undefined {
  const fromProcess = (opts.processEnv ?? process.env).ANTHROPIC_API_KEY;
  if (fromProcess) return fromProcess;
  try {
    const parsed = parseDotenv(readFileSync(opts.envFile ?? ".env"));
    return parsed.ANTHROPIC_API_KEY || undefined;
  } catch {
    return undefined;
  }
}

/** One global async gate: only one live model call (count -> gate -> create -> settle) is in flight at a time. */
class SerialisedClient implements LlmChatClient {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly inner: LlmChatClient) {}
  chat(params: { systemPrompt: string; messages: LlmChatMessage[] }): Promise<LlmChatResult> {
    const run = this.tail.then(() => this.inner.chat(params));
    this.tail = run.catch(() => undefined);
    return run;
  }
}

export function createLiveSession(opts: { apiKey: string; sdk?: MessagesSdk; budgetUsd?: number }): LiveSession {
  const budgetUsd = opts.budgetUsd ?? LIVE_BUDGET_CAP_USD;
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("live budget must be a positive number");
  if (budgetUsd > LIVE_BUDGET_CAP_USD) throw new Error(`live budget $${budgetUsd} exceeds the authorised $${LIVE_BUDGET_CAP_USD.toFixed(2)} for this session`);
  const price = PRICE_SNAPSHOTS[LIVE_MODEL];
  const ledger = new Ledger({ capUsd: budgetUsd, stopUsd: Number((budgetUsd * STOP_FRACTION).toFixed(6)), passes: 1, model: LIVE_MODEL, price });
  // maxRetries: 0 — an SDK-level automatic retry would be a second billed request outside the ledger.
  const sdk: MessagesSdk = opts.sdk ?? (new Anthropic({ apiKey: opts.apiKey, timeout: 30_000, maxRetries: 0 }) as unknown as MessagesSdk);
  const client = new SerialisedClient(new CappedClient(sdk, ledger));
  return {
    client,
    isHalted: () => ledger.haltedReason,
    snapshot: () => ({
      available: true,
      label: LIVE_LABEL,
      model: LIVE_MODEL,
      budgetUsd,
      spentUsd: Number(ledger.spentUsd.toFixed(6)),
      remainingUsd: Number(Math.max(0, budgetUsd - ledger.spentUsd).toFixed(6)),
      calls: ledger.calls,
      inputTokens: ledger.inputTokens,
      outputTokens: ledger.outputTokens,
      halted: ledger.haltedReason ? redactSecrets(ledger.haltedReason, opts.apiKey) : null,
      estimate: true,
    }),
  };
}
