import { and, asc, eq, lte } from "drizzle-orm";
import { conversations, customers, messages } from "../db/schema";
import type { Db } from "../db/client";
import type { MessagingProvider, OutboundMessageResult } from "./messaging-provider";

/**
 * Outbound retry mechanism — the durable answer to "an outbound
 * WhatsApp send failed" beyond simply recording `status: "failed"`
 * (Phase 10 of the prior milestone). Minimum-safe design given the
 * EXISTING schema: no new table — a retry is fundamentally "attempt to
 * send THIS message row again," so `messages` grew three columns
 * (`outboundAttempts`, `nextRetryAt`, `lastError`) rather than gaining a
 * sibling "failed_outbound"/"retry_queue" table to keep in sync with it.
 *
 * STATE MACHINE (all transitions go through recordSendOutcome, the ONE
 * place this logic lives — used identically by the initial synchronous
 * send in webhook-processing.ts's sendReply and by this file's own
 * retry worker, so there is exactly one implementation of "what happens
 * after a send attempt" regardless of which attempt number it is):
 *
 *   (attempt succeeds)              -> status="sent",          nextRetryAt=null
 *   (attempt fails, NOT retryable)  -> status="failed",        nextRetryAt=null   (no pointless retry)
 *   (attempt fails, retryable,
 *    attempts >= MAX_ATTEMPTS)      -> status="failed",        nextRetryAt=null   (bounded — no infinite loop)
 *   (attempt fails, retryable,
 *    attempts <  MAX_ATTEMPTS)      -> status="retry_pending", nextRetryAt=now+backoff(attempts)
 *
 * RETRY SAFETY:
 *   - Durable: state lives in Postgres (`messages` columns), not memory
 *     — survives a process restart with zero special-casing (the worker
 *     just queries `status='retry_pending' AND nextRetryAt <= now()`
 *     again, exactly as it would mid-uptime).
 *   - Safe with multiple processes: `runOutboundRetryWorker` selects its
 *     batch with `FOR UPDATE OF messages SKIP LOCKED` — a standard
 *     Postgres job-queue pattern. Two workers polling concurrently each
 *     get a DISJOINT set of due rows; neither blocks the other, neither
 *     double-sends the same row. `OF messages` (not the joined
 *     conversations/customers rows too) deliberately avoids taking a row
 *     lock on `conversations`, which would otherwise contend with the
 *     unrelated per-customer advisory-lock-protected bookingState
 *     writes in webhook-processing.ts.
 *   - Bounded: MAX_OUTBOUND_ATTEMPTS caps total attempts; a message that
 *     exhausts it is marked "failed" and never selected again.
 *   - No duplicate customer-visible messages from RETRYING (as opposed
 *     to from the underlying send being ambiguous — see below): a
 *     retry only ever fires for a message whose LAST attempt is known
 *     to have failed; a message that already reached "sent" is
 *     `status="sent"`, never `"retry_pending"`, and is never selected
 *     again. The one HONEST, NOT-fully-solvable risk (documented, not
 *     hidden): if a send genuinely succeeded on Meta's side but the
 *     success response was lost on OUR side (e.g. this process crashed
 *     between Meta accepting the message and this code recording
 *     "sent"), a subsequent retry would resend a message the customer
 *     already received. The WhatsApp Cloud API has no idempotency-key
 *     mechanism for outbound sends to prevent this outright; every
 *     system built on it carries this same narrow window.
 *   - Outbound idempotency preserved: this never creates a NEW
 *     `messages` row for a retry — it updates the SAME row's
 *     status/attempts/nextRetryAt, so the durable record of "this
 *     conversation turn's one reply" stays exactly one row throughout
 *     its whole retry lifecycle.
 */

/** Total attempts (including the FIRST, synchronous one made by
 * sendReply at reply time) before a retryable failure is given up on.
 * 5 means: 1 initial attempt + up to 4 worker-driven retries. */
export const MAX_OUTBOUND_ATTEMPTS = 5;

/** Exponential-ish backoff, seconds, indexed by (attemptNumber - 1) and
 * capped at the last entry for any attempt beyond this list's length.
 * Deliberately short (a customer is waiting on a reply) while still
 * spacing out load on a struggling downstream — 30s/1m/2m/4m. */
const BACKOFF_SECONDS_BY_ATTEMPT = [30, 60, 120, 240];

function backoffSecondsForAttempt(attemptNumber: number): number {
  const index = Math.min(attemptNumber - 1, BACKOFF_SECONDS_BY_ATTEMPT.length - 1);
  return BACKOFF_SECONDS_BY_ATTEMPT[index];
}

export type SendOutcomeStatus = "sent" | "retry_pending" | "failed";

/** Applies the outcome of ONE send attempt (whichever attempt number it
 * is) to the durable row — the single implementation of the state
 * machine described above. `currentAttempts` is the row's
 * `outboundAttempts` value BEFORE this attempt (0 for the very first
 * send). Never throws for an ordinary failed send; a thrown error here
 * means the DATABASE write itself failed, a genuinely different problem
 * the caller has no principled way to recover from. */
export async function recordSendOutcome(
  db: Db,
  messageId: string,
  currentAttempts: number,
  result: OutboundMessageResult,
  now: Date = new Date(),
): Promise<SendOutcomeStatus> {
  if (result.success) {
    await db
      .update(messages)
      .set({ status: "sent", nextRetryAt: null, lastError: null, outboundAttempts: currentAttempts + 1 })
      .where(eq(messages.id, messageId));
    return "sent";
  }

  const attempts = currentAttempts + 1;
  const exhausted = attempts >= MAX_OUTBOUND_ATTEMPTS;
  const permanent = result.retryable !== true;

  if (permanent || exhausted) {
    await db
      .update(messages)
      .set({ status: "failed", nextRetryAt: null, lastError: result.error, outboundAttempts: attempts })
      .where(eq(messages.id, messageId));
    return "failed";
  }

  const nextRetryAt = new Date(now.getTime() + backoffSecondsForAttempt(attempts) * 1000);
  await db
    .update(messages)
    .set({ status: "retry_pending", nextRetryAt, lastError: result.error, outboundAttempts: attempts })
    .where(eq(messages.id, messageId));
  return "retry_pending";
}

/** How many due rows one worker pass claims at most — bounds worst-case
 * work per tick; a real backlog just gets drained over several ticks
 * rather than one pass trying to do everything. */
const BATCH_SIZE = 20;

export interface RetryWorkerResult {
  /** How many due messages this pass attempted (successfully sent,
   * rescheduled, or permanently failed — every one of them got SOME
   * outcome recorded). */
  attempted: number;
  sent: number;
  rescheduled: number;
  failed: number;
}

/**
 * One worker pass: claims every `retry_pending` message whose
 * `nextRetryAt` has arrived (oldest-due first, bounded to BATCH_SIZE),
 * re-attempts sending each through `messaging`, and records the outcome
 * via recordSendOutcome. Safe to call from multiple processes on a
 * timer/poller (see startOutboundRetryPoller) — see this file's own
 * docstring for the SKIP LOCKED mechanism that makes concurrent callers
 * safe. Never throws for an individual message's send failure (that's
 * the normal case this function exists to handle); a thrown error means
 * the database itself is unavailable, which the caller (the poller)
 * already treats as "try again next tick."
 */
export async function runOutboundRetryWorker(
  db: Db,
  messaging: MessagingProvider,
  now: Date = new Date(),
): Promise<RetryWorkerResult> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: messages.id,
        content: messages.content,
        outboundAttempts: messages.outboundAttempts,
        whatsappId: customers.whatsappId,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(customers, eq(conversations.customerId, customers.id))
      .where(and(eq(messages.status, "retry_pending"), lte(messages.nextRetryAt, now)))
      .orderBy(asc(messages.nextRetryAt))
      .limit(BATCH_SIZE)
      .for("update", { of: messages, skipLocked: true });

    const result: RetryWorkerResult = { attempted: 0, sent: 0, rescheduled: 0, failed: 0 };
    for (const row of due) {
      result.attempted++;
      // whatsappId is stored "+"-prefixed (see webhook-processing.ts) —
      // the exact same value the original, first-attempt send used.
      const outcome = await messaging.sendText(row.whatsappId, row.content);
      const status = await recordSendOutcome(tx, row.id, row.outboundAttempts, outcome, now);
      if (status === "sent") result.sent++;
      else if (status === "retry_pending") result.rescheduled++;
      else result.failed++;
    }
    return result;
  });
}

/** Starts an in-process poller calling runOutboundRetryWorker on a
 * fixed interval — the whole "background job" mechanism this milestone
 * needs, deliberately NOT a separate service/queue (no unnecessary new
 * infrastructure — Postgres's own SKIP LOCKED already makes this safe
 * to run from more than one process, so horizontally scaling this
 * app's normal web process is what "scaling the worker" means too,
 * with no additional deployment artifact). A single failed pass (e.g.
 * a transient DB hiccup) is logged and never stops the poller — the
 * next tick tries again. Returns a stop function for clean shutdown
 * and for tests that don't want a dangling timer. */
export function startOutboundRetryPoller(
  db: Db,
  messaging: MessagingProvider,
  intervalMs: number,
): { stop: () => void } {
  const timer = setInterval(() => {
    runOutboundRetryWorker(db, messaging).catch((error: unknown) => {
      console.error("[outbound retry worker] pass failed:", error);
    });
  }, intervalMs);
  timer.unref?.(); // never keeps the process alive on its own
  return { stop: () => clearInterval(timer) };
}
