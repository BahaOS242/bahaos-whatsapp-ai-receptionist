import type { Db } from "../db/client";
import type { BookingState, BusinessContext } from "../ai/types";
import { extractCandidates, matchServiceId } from "./extractor";
import { detectMemoryControl } from "./policy";
import { renderControlNotice, retrieveMemory } from "./retrieval";
import { applyCandidate, deleteByKinds, type MemoryScope } from "./store";
import { noopMemoryTelemetry, type MemoryTelemetry } from "./telemetry";
import { REQUESTED_HUMAN_TTL_SECONDS, SERVICE_INQUIRY_TTL_SECONDS, type MemoryCandidate } from "./types";

export interface MemoryServiceOptions {
  business: BusinessContext;
  telemetry?: MemoryTelemetry;
  now?: () => Date;
}

export interface TurnScope extends MemoryScope {
  conversationId?: string;
  sourceMessageId?: string;
}

/**
 * Orchestrates extraction and retrieval. Every public method is best-effort:
 * a memory failure NEVER propagates into the customer's turn. Callers hand in
 * a db handle that is already a savepoint (see webhook-processing), so a
 * failed statement cannot poison the surrounding transaction either.
 */
export class MemoryService {
  private readonly business: BusinessContext;
  private readonly telemetry: MemoryTelemetry;
  private readonly now: () => Date;

  constructor(opts: MemoryServiceOptions) {
    this.business = opts.business;
    this.telemetry = opts.telemetry ?? noopMemoryTelemetry;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Runs `work` inside a transaction on `db` — a SAVEPOINT when `db` is
   * already a transaction — so a failing memory statement rolls back only
   * itself and can never abort the customer's turn.
   */
  private async guarded<T>(db: Db, stage: string, work: (sp: Db) => Promise<T>): Promise<T | undefined> {
    try {
      return await db.transaction(async (sp) => work(sp as unknown as Db));
    } catch (error) {
      this.telemetry.emit(stage === "retrieval" ? "retrieval_failed" : "extraction_failed", { stage, error: error instanceof Error ? error.name : "unknown" });
      return undefined;
    }
  }

  /** Extracts and stores explicit facts from ONE customer message. Returns counts only. */
  async processCustomerMessage(db: Db, scope: TurnScope, message: string): Promise<{ accepted: number; rejected: number }> {
    const events: Array<Parameters<MemoryTelemetry["emit"]>> = [];

    // The customer is managing memory: remove what they referred to, learn nothing from this message.
    const control = detectMemoryControl(message);
    if (control) {
      const removed = await this.guarded(db, "control", (sp) => deleteByKinds(sp, scope, control.scope, this.now()));
      if (removed !== undefined) this.telemetry.emit("memory_control_request", { removed, scope: control.scope === "all" ? "all" : control.scope.length });
      return { accepted: 0, rejected: 0 };
    }

    const out = await this.guarded(db, "extract", async (sp) => {
      let accepted = 0;
      let rejected = 0;
      const { candidates, screened } = extractCandidates(message, this.business);
      const screenedCount = Object.values(screened).reduce((a, b) => a + b, 0);
      events.push(["candidates_proposed", { proposed: candidates.length, screened: screenedCount }]);
      for (const [reason, n] of Object.entries(screened)) events.push(["candidate_rejected", { stage: "screen", reason, count: n }]);
      rejected += screenedCount;
      for (const c of candidates) {
        const r = await applyCandidate(sp, scope, c, { conversationId: scope.conversationId, sourceMessageId: scope.sourceMessageId, now: this.now() });
        if (r.outcome === "rejected") {
          rejected++;
          events.push(["candidate_rejected", { stage: "validate", reason: r.reason, kind: c.kind }]);
        } else {
          accepted++;
          events.push(["candidate_accepted", { kind: c.kind, outcome: r.outcome }]);
          if (r.outcome === "created" && r.supersededId) events.push(["memory_corrected", { kind: c.kind }]);
        }
      }
      return { accepted, rejected };
    });
    if (out) for (const e of events) this.telemetry.emit(...e); // only after the write committed/released
    return out ?? { accepted: 0, rejected: 0 };
  }

  /** Application-derived continuity (never LLM-proposed). */
  async recordContinuity(db: Db, scope: TurnScope, signal: { type: "requested_human" } | { type: "service_inquiry"; message: string }): Promise<void> {
    let c: MemoryCandidate | null = null;
    if (signal.type === "requested_human") {
      c = { kind: "continuity", slot: "requested_human", value: "yes", source: "system_derived", provenance: "explicit", ttlSeconds: REQUESTED_HUMAN_TTL_SECONDS };
    } else {
      const id = matchServiceId(signal.message, this.business);
      const svc = id ? this.business.services.find((s) => String(s.id) === id) : undefined;
      if (id && svc) c = { kind: "continuity", slot: `inquiry:${id}`, value: id, display: svc.name, source: "system_derived", provenance: "explicit", ttlSeconds: SERVICE_INQUIRY_TTL_SECONDS };
    }
    if (!c) return;
    const candidate = c;
    const r = await this.guarded(db, "continuity", (sp) =>
      applyCandidate(sp, scope, candidate, { conversationId: scope.conversationId, sourceMessageId: scope.sourceMessageId, now: this.now() }),
    );
    if (!r) return;
    this.telemetry.emit(r.outcome === "rejected" ? "candidate_rejected" : "candidate_accepted", { kind: "continuity", ...(r.outcome === "rejected" ? { reason: r.reason } : { outcome: r.outcome }) });
  }

  /** The prompt block for this turn, or undefined. */
  async contextFor(db: Db, scope: MemoryScope, message: string, state?: BookingState): Promise<string | undefined> {
    // A privacy request this turn: the ONLY memory context is the truthful notice. No facts.
    if (detectMemoryControl(message)) return renderControlNotice();
    const r = await this.guarded(db, "retrieval", (sp) => retrieveMemory(sp, scope, message, state, this.business, this.now()));
    if (!r) return undefined;
    this.telemetry.emit("retrieval", { returned: r.memories.length });
    return r.block;
  }
}
