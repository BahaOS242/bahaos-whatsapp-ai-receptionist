import { sql } from "drizzle-orm";
import { cancelSupersededAiRows } from "./outbox-supersede";
import type { Db } from "../db/client";
import { lockProviderMessage, reconcileDeliveryForProviderMessage } from "./delivery-receipts";
import type { MessagingProvider, OutboundMessageResult } from "./messaging-provider";
import {
  decideAfterFailure,
  OUTBOX_LEASE_SECONDS,
  OUTBOX_SEND_CEILING_MS,
  OUTBOX_SEND_MARGIN_MS,
} from "./outbox";

/**
 * OUTBOX WORKER — the only module in the application that calls
 * MessagingProvider.sendText (a guard test enforces this).
 *
 * CLAIMING. One atomic statement: pick due rows `FOR UPDATE SKIP LOCKED`
 * and flip them to `processing` with a lease and a fresh fencing token,
 * returning exactly the rows this worker now owns. Two workers can never
 * claim the same row — the database decides, not application code.
 * There is no "select then process later".
 *
 * ELIGIBLE rows: `pending`, `retry_wait` whose available_at has arrived,
 * and `processing` whose lease EXPIRED (a dead worker's abandoned claim —
 * this is the crash recovery; there is no separate reaper to race).
 *
 * ORDERING. The ordering key is the CONVERSATION. A row is claimable only
 * if no EARLIER (lower seq) row of the same conversation is still
 * unfinished (pending / processing / retry_wait). So within a
 * conversation messages are delivered one at a time, in order — a
 * failing message holds back later ones for that conversation ONLY;
 * other conversations are never blocked. `sent` and `dead_letter` are
 * terminal and release the line (a dead-lettered message does not block
 * a customer forever).
 *
 * TRANSACTIONS. Claiming is one short statement. The provider call
 * happens with NO transaction open. Recording the outcome is one short
 * transaction. Meta is never awaited while a database transaction is held.
 *
 * FENCING. Every claim gets a new `claim_token`; outcomes are written
 * `WHERE status='processing' AND claim_token = <mine>`. A slow worker
 * whose lease expired (and whose row was re-claimed) therefore cannot
 * overwrite the newer attempt's outcome — its write affects 0 rows and
 * is reported as `lostLease`.
 *
 * DELIVERY SEMANTICS: durable AT-LEAST-ONCE. The exact duplicate windows
 * are documented in OUTBOX.md — they are inherent to a provider with no
 * idempotency key, and are narrowed (never hidden) here.
 */

export interface ClaimedOutbound {
  id: string;
  tenantId: string;
  conversationId: string;
  messageId: string;
  recipient: string;
  body: string;
  attemptCount: number;
  maxAttempts: number;
  leaseExpiresAt: Date;
  claimToken: string;
}

export interface OutboxWorkerOptions {
  clock?: () => Date;
  leaseSeconds?: number;
  batchSize?: number;
  /** Restrict this worker to one tenant (never touches another's rows). */
  tenantId?: string;
  /** Restrict to one conversation (used for inline delivery). */
  conversationId?: string;
  rng?: () => number;
  /** Hard ceiling on one provider call (default OUTBOX_SEND_CEILING_MS). */
  sendCeilingMs?: number;
  /** Minimum lease that must remain to START a send (default
   * OUTBOX_SEND_MARGIN_MS). Exposed so cross-process tests can use short
   * leases; production uses the default. */
  sendMarginMs?: number;
  /** Test seam: observe/alter the moment between claim and send. */
  beforeSend?: (row: ClaimedOutbound) => void | Promise<void>;
  /** Test seam: observe the moment between provider result and DB write. */
  afterSend?: (row: ClaimedOutbound, result: OutboundMessageResult) => void | Promise<void>;
}

export interface OutboxPassResult {
  claimed: number;
  sent: number;
  retried: number;
  deadLettered: number;
  /** The row's lease was lost before the outcome could be recorded. */
  lostLease: number;
  /** Not sent: too little lease remained to start safely. */
  skipped: number;
  /** Withdrawn: superseded by a human takeover before any provider call. */
  cancelled: number;
}

const emptyPass = (): OutboxPassResult => ({ claimed: 0, sent: 0, retried: 0, deadLettered: 0, lostLease: 0, skipped: 0, cancelled: 0 });

interface RawRow {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  recipient: string;
  payload: { body: string };
  attempt_count: number;
  max_attempts: number;
  lease_expires_at: Date | string;
  claim_token: string;
  seq: string | number;
}

const iso = (d: Date) => d.toISOString();

/** Outcome writes replace the per-attempt diagnostics in `error_metadata`
 * but must NEVER drop the append-only `history` (written by requeue). */
const keepHistory = sql`(CASE WHEN error_metadata ? 'history' THEN jsonb_build_object('history', error_metadata->'history') ELSE '{}'::jsonb END)`;

/** Dead-letters rows whose lease expired with NO attempts left — a
 * message whose delivery keeps killing its worker must not be re-claimed
 * forever. */
async function deadLetterPoisoned(db: Db, now: Date, opts: OutboxWorkerOptions): Promise<void> {
  const rows = await db.execute(sql`
    UPDATE outbox_messages
       SET status = 'dead_letter', failed_at = ${iso(now)}::timestamptz, lease_expires_at = NULL, claim_token = NULL,
           error_code = 'lease_expired_exhausted',
           last_error = 'worker lease expired on the final allowed attempt',
           error_metadata = (CASE WHEN error_metadata ? 'history' THEN jsonb_build_object('history', error_metadata->'history') ELSE '{}'::jsonb END) || jsonb_build_object('deadLetterReason', 'lease_expired_exhausted'),
           updated_at = ${iso(now)}::timestamptz
     WHERE status = 'processing' AND lease_expires_at <= ${iso(now)}::timestamptz AND attempt_count >= max_attempts
       ${opts.tenantId ? sql`AND tenant_id = ${opts.tenantId}::uuid` : sql``}
       ${opts.conversationId ? sql`AND conversation_id = ${opts.conversationId}::uuid` : sql``}
 RETURNING message_id, attempt_count`);
  for (const r of rows.rows as Array<{ message_id: string; attempt_count: number }>) {
    await db.execute(sql`UPDATE messages SET status = 'failed', outbound_attempts = ${r.attempt_count},
        last_error = 'worker lease expired on the final allowed attempt', next_retry_at = NULL WHERE id = ${r.message_id}::uuid`);
  }
}

/** Atomically claims up to `batchSize` deliverable rows (see the module
 * docstring for eligibility and ordering). */
export async function claimOutboundBatch(db: Db, opts: OutboxWorkerOptions = {}): Promise<ClaimedOutbound[]> {
  const now = (opts.clock ?? (() => new Date()))();
  const lease = opts.leaseSeconds ?? OUTBOX_LEASE_SECONDS;
  const limit = opts.batchSize ?? 20;
  await deadLetterPoisoned(db, now, opts);
  // Rows that can never be delivered (AI-authored, human now owns the conversation) must not
  // sit in the queue and block the staff replies ordered behind them.
  await cancelSupersededAiRows(db, { tenantId: opts.tenantId, now });

  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT o.id
        FROM outbox_messages o
       WHERE ( (o.status IN ('pending', 'retry_wait') AND o.available_at <= ${iso(now)}::timestamptz)
            OR (o.status = 'processing' AND o.lease_expires_at <= ${iso(now)}::timestamptz) )
         ${opts.tenantId ? sql`AND o.tenant_id = ${opts.tenantId}::uuid` : sql``}
         ${opts.conversationId ? sql`AND o.conversation_id = ${opts.conversationId}::uuid` : sql``}
         -- A human owns the conversation: an AI-authored message must not be
         -- delivered over them. (Staff-authored messages always may.)
         AND NOT (o.origin = 'ai' AND EXISTS (
               SELECT 1 FROM conversations cv WHERE cv.id = o.conversation_id AND cv.status = 'staff_owned'))
         AND NOT EXISTS (
               SELECT 1 FROM outbox_messages p
                WHERE p.conversation_id = o.conversation_id
                  AND p.seq < o.seq
                  AND p.status IN ('pending', 'processing', 'retry_wait'))
       ORDER BY o.seq
       LIMIT ${limit}
         FOR UPDATE OF o SKIP LOCKED
    )
    UPDATE outbox_messages u
       SET status = 'processing',
           claimed_at = ${iso(now)}::timestamptz,
           lease_expires_at = ${iso(new Date(now.getTime() + lease * 1000))}::timestamptz,
           claim_token = gen_random_uuid(),
           attempt_count = u.attempt_count + 1,
           last_attempt_at = ${iso(now)}::timestamptz,
           updated_at = ${iso(now)}::timestamptz
      FROM candidates c
     WHERE u.id = c.id
 RETURNING u.id, u.tenant_id, u.conversation_id, u.message_id, u.recipient, u.payload,
           u.attempt_count, u.max_attempts, u.lease_expires_at, u.claim_token, u.seq`);

  // UPDATE ... RETURNING makes no ordering promise: deliver oldest first.
  const ordered = [...(result.rows as unknown as RawRow[])].sort((a, b) => Number(a.seq) - Number(b.seq));
  return ordered.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      conversationId: r.conversation_id,
      messageId: r.message_id,
      recipient: r.recipient,
      body: r.payload.body,
      attemptCount: r.attempt_count,
      maxAttempts: r.max_attempts,
      leaseExpiresAt: new Date(r.lease_expires_at),
      claimToken: r.claim_token,
  }));
}

type Outcome = "sent" | "retried" | "dead_lettered" | "lost_lease" | "skipped" | "cancelled";

/** Races a provider call against a hard ceiling; the timer is always
 * cleared so a fast send leaves nothing behind. */
async function sendWithCeiling(send: () => Promise<OutboundMessageResult>, ms: number): Promise<OutboundMessageResult> {
  let timer: NodeJS.Timeout | undefined;
  const ceiling = new Promise<OutboundMessageResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ success: false, error: "send exceeded the worker's hard ceiling", retryable: true, errorCode: "worker_timeout", ambiguous: true }),
      ms,
    );
  });
  try {
    return await Promise.race([send(), ceiling]);
  } finally {
    clearTimeout(timer);
  }
}

/** Delivers one claimed row and records the outcome. Never throws for a
 * delivery failure. */
export async function deliverClaimed(
  db: Db,
  messaging: MessagingProvider,
  row: ClaimedOutbound,
  opts: OutboxWorkerOptions = {},
): Promise<Outcome> {
  const clock = opts.clock ?? (() => new Date());

  await opts.beforeSend?.(row);

  // Last line of defense before the provider is called: if this is an AI
  // message and a human has taken the conversation over since it was
  // queued/claimed, withdraw it instead of sending. (The only message this
  // cannot stop is one already handed to the provider.)
  if (await isSupersededByHuman(db, row)) {
    return withdrawSuperseded(db, row, clock());
  }

  // Never START a send that could outlive our own lease.
  if (row.leaseExpiresAt.getTime() - clock().getTime() < (opts.sendMarginMs ?? OUTBOX_SEND_MARGIN_MS)) return "skipped";

  let result: OutboundMessageResult;
  try {
    result = await sendWithCeiling(() => messaging.sendText(row.recipient, row.body), opts.sendCeilingMs ?? OUTBOX_SEND_CEILING_MS);
  } catch (error) {
    // The provider contract is "never throws"; if one does it is an
    // unexpected fault. Treat as retryable-but-bounded (attempts still
    // count), ambiguous (we do not know whether it left the building).
    result = {
      success: false,
      error: `provider threw: ${error instanceof Error ? error.message : "unknown"}`,
      retryable: true,
      errorCode: "provider_exception",
      ambiguous: true,
    };
  }
  await opts.afterSend?.(row, result);

  const now = clock();
  return recordOutcome(db, row, result, now, opts);
}

async function isSupersededByHuman(db: Db, row: ClaimedOutbound): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1 FROM outbox_messages o JOIN conversations cv ON cv.id = o.conversation_id
     WHERE o.id = ${row.id}::uuid AND o.origin = 'ai' AND cv.status = 'staff_owned'`);
  return r.rows.length > 0;
}

/** Fenced withdrawal of a claimed AI message: `cancelled`, mirrored to the
 * log as `suppressed`. Nothing was sent. */
async function withdrawSuperseded(db: Db, row: ClaimedOutbound, now: Date): Promise<Outcome> {
  return db.transaction(async (tx) => {
    const t = iso(now);
    const updated = await tx.execute(sql`
      UPDATE outbox_messages
         SET status = 'cancelled', failed_at = ${t}::timestamptz, lease_expires_at = NULL, claim_token = NULL,
             last_error = 'superseded: a staff member took over the conversation before delivery',
             error_code = 'superseded_by_human',
             error_metadata = COALESCE(error_metadata, '{}'::jsonb) || ${JSON.stringify({ withdrawn: { priorAttempts: row.attemptCount - 1 } })}::jsonb,
             updated_at = ${t}::timestamptz
       WHERE id = ${row.id}::uuid AND status = 'processing' AND claim_token = ${row.claimToken}::uuid RETURNING id`);
    if (updated.rows.length === 0) return "lost_lease";
    await tx.execute(sql`UPDATE messages SET status = 'suppressed', next_retry_at = NULL WHERE id = ${row.messageId}::uuid`);
    return "cancelled";
  });
}

async function recordOutcome(
  db: Db,
  row: ClaimedOutbound,
  result: OutboundMessageResult,
  now: Date,
  opts: OutboxWorkerOptions,
): Promise<Outcome> {
  const meta = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
      ...(result.metaCode !== undefined ? { metaCode: result.metaCode } : {}),
      ...(result.ambiguous !== undefined ? { ambiguous: result.ambiguous } : {}),
      ...extra,
    });
  const fence = sql`id = ${row.id}::uuid AND status = 'processing' AND claim_token = ${row.claimToken}::uuid`;
  const t = iso(now);

  if (result.success) {
    return db.transaction(async (tx) => {
      // Serialise with a receipt for this provider id being recorded right now (see delivery-receipts.ts): whichever side
      // commits second sees the other's work, so an early receipt is never lost.
      if (result.providerMessageId) await lockProviderMessage(tx, row.tenantId, result.providerMessageId);
      const updated = await tx.execute(sql`
        UPDATE outbox_messages
           SET status = 'sent', sent_at = ${t}::timestamptz, provider_message_id = ${result.providerMessageId ?? null},
               last_error = NULL, error_code = NULL, lease_expires_at = NULL, claim_token = NULL,
               error_metadata = NULLIF(${keepHistory} || ${result.providerMessageId ? "{}" : JSON.stringify({ acceptedWithoutProviderId: true })}::jsonb, '{}'::jsonb),
               updated_at = ${t}::timestamptz
         WHERE ${fence} RETURNING id`);
      if (updated.rows.length === 0) return "lost_lease";
      await tx.execute(sql`UPDATE messages SET status = 'sent', outbound_attempts = ${row.attemptCount}, next_retry_at = NULL, last_error = NULL WHERE id = ${row.messageId}::uuid`);
      // A receipt may have arrived before this id was saved: apply anything already in the ledger.
      if (result.providerMessageId) await reconcileDeliveryForProviderMessage(tx, row.tenantId, result.providerMessageId);
      return "sent";
    });
  }

  const decision = decideAfterFailure({
    attemptNumber: row.attemptCount,
    maxAttempts: row.maxAttempts,
    result,
    now,
    rng: opts.rng,
  });

  if (decision.kind === "retry") {
    return db.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        UPDATE outbox_messages
           SET status = 'retry_wait', available_at = ${iso(decision.availableAt)}::timestamptz,
               last_error = ${result.error ?? null}, error_code = ${result.errorCode ?? null},
               error_metadata = ${keepHistory} || ${meta()}::jsonb, lease_expires_at = NULL, claim_token = NULL, updated_at = ${t}::timestamptz
         WHERE ${fence} RETURNING id`);
      if (updated.rows.length === 0) return "lost_lease";
      await tx.execute(sql`UPDATE messages SET status = 'retry_pending', outbound_attempts = ${row.attemptCount},
          next_retry_at = ${iso(decision.availableAt)}::timestamptz, last_error = ${result.error ?? null} WHERE id = ${row.messageId}::uuid`);
      return "retried";
    });
  }

  return db.transaction(async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE outbox_messages
         SET status = 'dead_letter', failed_at = ${t}::timestamptz,
             last_error = ${result.error ?? null}, error_code = ${result.errorCode ?? null},
             error_metadata = ${keepHistory} || ${meta({ deadLetterReason: decision.reason })}::jsonb,
             lease_expires_at = NULL, claim_token = NULL, updated_at = ${t}::timestamptz
       WHERE ${fence} RETURNING id`);
    if (updated.rows.length === 0) return "lost_lease";
    await tx.execute(sql`UPDATE messages SET status = 'failed', outbound_attempts = ${row.attemptCount}, next_retry_at = NULL,
        last_error = ${result.error ?? null} WHERE id = ${row.messageId}::uuid`);
    return "dead_lettered";
  });
}

/** One worker pass: claim a batch, deliver each, record each outcome. */
export async function runOutboxPass(db: Db, messaging: MessagingProvider, opts: OutboxWorkerOptions = {}): Promise<OutboxPassResult> {
  const out = emptyPass();
  const claimed = await claimOutboundBatch(db, opts);
  out.claimed = claimed.length;
  for (const row of claimed) {
    const outcome = await deliverClaimed(db, messaging, row, opts);
    if (outcome === "sent") out.sent++;
    else if (outcome === "retried") out.retried++;
    else if (outcome === "dead_lettered") out.deadLettered++;
    else if (outcome === "lost_lease") out.lostLease++;
    else if (outcome === "cancelled") out.cancelled++;
    else out.skipped++;
  }
  return out;
}

/**
 * Delivers whatever is deliverable for ONE conversation, in order, right
 * now — the inline fast path the webhook uses after its business
 * transaction has COMMITTED. It runs the exact same claim -> send ->
 * record code as the background poller, outside any transaction; if it
 * fails or the process dies mid-way, the poller recovers the row. A
 * failure here never affects the business outcome that already committed.
 */
export async function drainConversation(
  db: Db,
  messaging: MessagingProvider,
  conversationId: string,
  opts: Omit<OutboxWorkerOptions, "conversationId"> = {},
  maxMessages = 10,
): Promise<OutboxPassResult> {
  const total = emptyPass();
  for (let i = 0; i < maxMessages; i++) {
    const pass = await runOutboxPass(db, messaging, { ...opts, conversationId, batchSize: 1 });
    for (const k of Object.keys(total) as Array<keyof OutboxPassResult>) total[k] += pass[k];
    if (pass.claimed === 0 || pass.sent === 0) break; // nothing more deliverable right now
  }
  return total;
}

const wakeListeners = new Set<() => void>();

/**
 * Tells every in-process outbox poller "there is new work — look now".
 * Fire-and-forget by design: it NEVER delivers anything itself and never
 * waits for delivery. The webhook calls this AFTER it has sent its HTTP
 * response, so a queued reply goes out within milliseconds without any
 * provider call existing on the request path. With no poller running
 * (tests, scripts) it is a harmless no-op.
 */
export function wakeOutboxWorkers(): void {
  for (const listener of wakeListeners) listener();
}

/** Background poller: the crash/restart backstop and retry driver. Safe
 * to run in many processes (SKIP LOCKED). Never stops on a failed tick;
 * never overlaps itself within one process. */
export function startOutboxPoller(
  db: Db,
  messaging: MessagingProvider,
  intervalMs: number,
  opts: OutboxWorkerOptions = {},
): { stop: () => Promise<void> } {
  let running = false;
  let rerun = false; // a wake-up arrived while a pass was in flight
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();
  const tick = () => {
    if (stopped) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    inFlight = (async () => {
      do {
        rerun = false;
        // Drain a backlog within one tick, but bounded.
        for (let i = 0; i < 20 && !stopped; i++) {
          const pass = await runOutboxPass(db, messaging, opts);
          if (pass.claimed < (opts.batchSize ?? 20)) break;
        }
      } while (rerun && !stopped);
    })()
      .catch((error: unknown) => console.error("[outbox worker] pass failed:", error))
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  const wake = () => setImmediate(tick);
  wakeListeners.add(wake);
  return {
    /** Stops polling and resolves once any pass already in flight has
     * finished — after it resolves this poller can never touch the outbox
     * again (graceful shutdown; also keeps tests from leaking a worker). */
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      wakeListeners.delete(wake);
      await inFlight;
    },
  };
}
