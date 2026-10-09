/**
 * Run configuration, price snapshot and spend ledger for the live evaluation harness.
 * Pure and offline-testable (tests/live-eval). The controls here exist because the run SPENDS REAL
 * MONEY: nothing may be silently coerced, defaulted past a limit, or assumed free.
 */

/** Models this harness is authorised to call. Anything else is refused — add deliberately, with a price snapshot. */
export const APPROVED_MODELS = ["claude-haiku-4-5-20251001"] as const;

export interface PriceSnapshot { model: string; inputUsdPerMTok: number; outputUsdPerMTok: number; snapshotDate: string; source: string }
/** Named price snapshots. A new model or a price change needs a NEW entry; constants are never reused silently. */
export const PRICE_SNAPSHOTS: Record<string, PriceSnapshot> = {
  "claude-haiku-4-5-20251001": { model: "claude-haiku-4-5-20251001", inputUsdPerMTok: 1, outputUsdPerMTok: 5, snapshotDate: "2026-10-06", source: "Anthropic model table cached in the claude-api skill (claude-haiku-4-5)" },
};

export const MAX_CAP_USD = 25; // absolute ceiling this script will ever accept, whatever the flag says
export const MAX_PASSES = 10;
export const MAX_OUTPUT_TOKENS = 1024; // identical to the production client's max_tokens

export interface RunConfig { capUsd: number; passes: number; model: string; price: PriceSnapshot }

export class ConfigError extends Error {}

function flag(argv: string[], name: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/** Strict parse: finite, positive, bounded numbers; exact-allowlist model; a price snapshot must exist. Throws ConfigError. */
export function parseConfig(argv: string[], env: Record<string, string | undefined>): RunConfig {
  const capRaw = flag(argv, "cap");
  const passRaw = flag(argv, "passes");
  if (capRaw === undefined) throw new ConfigError("--cap=<usd> is required (explicit approved spend limit)");
  if (!/^\d+(\.\d+)?$/.test(capRaw)) throw new ConfigError(`--cap must be a plain positive decimal number, got ${JSON.stringify(capRaw)}`);
  const capUsd = Number(capRaw);
  if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > MAX_CAP_USD) throw new ConfigError(`--cap must be > 0 and <= ${MAX_CAP_USD}`);
  const passes = passRaw === undefined ? 1 : Number(passRaw);
  if (passRaw !== undefined && !/^\d+$/.test(passRaw)) throw new ConfigError(`--passes must be a positive integer, got ${JSON.stringify(passRaw)}`);
  if (!Number.isInteger(passes) || passes < 1 || passes > MAX_PASSES) throw new ConfigError(`--passes must be an integer in 1..${MAX_PASSES}`);
  const model = env.ANTHROPIC_MODEL ?? APPROVED_MODELS[0];
  if (!(APPROVED_MODELS as readonly string[]).includes(model)) throw new ConfigError(`model ${JSON.stringify(model)} is not on the approved list ${JSON.stringify(APPROVED_MODELS)}`);
  const price = PRICE_SNAPSHOTS[model];
  if (!price) throw new ConfigError(`no price snapshot for ${model}`);
  return { capUsd, passes, model, price };
}

export class BudgetExceeded extends Error {}
export class UsageUnknown extends Error {}

/**
 * Conservative INPUT-token upper bound: one token per 2 characters. English/JSON average ~3.5-4 chars per
 * token, so this over-reserves ~2x. It is a defensible bound, not a proof — which is why every settled call
 * is also compared against it (see settle): an under-estimate halts the run.
 */
export function inputTokenUpperBound(chars: number): number { return Math.ceil(chars / 2) + 64; }

export class Ledger {
  spentUsd = 0;
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  haltedReason: string | null = null;
  constructor(readonly cfg: RunConfig) {}

  private cost(inTok: number, outTok: number) { return (inTok * this.cfg.price.inputUsdPerMTok + outTok * this.cfg.price.outputUsdPerMTok) / 1e6; }
  worstCaseCost(requestChars: number) { return this.cost(inputTokenUpperBound(requestChars), MAX_OUTPUT_TOKENS); }

  /** Call BEFORE every request. Reserves nothing, but refuses if the worst case would cross the cap. */
  gate(requestChars: number): number {
    if (this.haltedReason) throw new BudgetExceeded(this.haltedReason);
    const worst = this.worstCaseCost(requestChars);
    if (!Number.isFinite(worst) || this.spentUsd + worst > this.cfg.capUsd) {
      this.haltedReason = `next call could cost up to $${worst.toFixed(4)}; spent $${this.spentUsd.toFixed(4)} of $${this.cfg.capUsd}`;
      throw new BudgetExceeded(this.haltedReason);
    }
    return worst;
  }

  /** Settle a SUCCESSFUL response. Missing/garbled usage, or usage above our own bound, halts the run. */
  settle(usage: { input_tokens?: unknown; output_tokens?: unknown } | undefined, requestChars: number, reservedWorst: number): void {
    const i = usage?.input_tokens, o = usage?.output_tokens;
    if (typeof i !== "number" || typeof o !== "number" || !Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0) {
      this.chargeWorst(reservedWorst, "response had no usable usage numbers");
      throw new UsageUnknown(this.haltedReason!);
    }
    this.calls++; this.inputTokens += i; this.outputTokens += o;
    this.spentUsd += this.cost(i, o);
    if (i > inputTokenUpperBound(requestChars)) {
      this.haltedReason = `input token bound under-estimated (actual ${i} > bound ${inputTokenUpperBound(requestChars)}); halting`;
      throw new UsageUnknown(this.haltedReason);
    }
  }

  /** A failed request (timeout/transport/5xx) may still have been billed: charge the reserved worst case and halt. */
  failed(reservedWorst: number, why: string): void { this.chargeWorst(reservedWorst, `request failed (${why})`); }

  private chargeWorst(worst: number, why: string) {
    this.spentUsd += worst;
    this.haltedReason = `${why}; usage unknown, charged worst case $${worst.toFixed(4)} and halted (spent $${this.spentUsd.toFixed(4)})`;
  }
}
