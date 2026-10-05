import { sql } from "drizzle-orm";
import { PersistedConversationManager } from "../db/persisted-conversation";
import { findOrCreateActiveConversation } from "../db/conversations";
import { resolveCustomer, resolveTenant } from "../db/domain-resolution";
import { recordSendOutcome } from "../messaging/outbound-retry-worker";
import { isRateLimited } from "./rate-limit";
import type { Db } from "../db/client";
import type { MessagingProvider } from "../messaging/messaging-provider";
import type { ReceptionistAgent } from "../ai/receptionist-agent";
import type { BusinessContext } from "../ai/types";

/**
 * The actual glue between the WhatsApp webhook boundary and the
 * already-hardened receptionist engine — PersistedConversationManager,
 * ReceptionistAgent, and ReceptionistTools are all reused exactly as
 * they exist; nothing about the booking/confirmation/state machinery is
 * touched here. This module's own job is narrow: turn one normalized
 * inbound WhatsApp message into (a) durable state, safely, even under
 * concurrent delivery, and (b) a reply to send back.
 *
 * PHASE 5 CONCURRENCY STRATEGY — read this before changing anything
 * here:
 *
 * Two inbound messages from the SAME customer arriving close together
 * (a genuine double-text, or a WhatsApp retry racing the original
 * delivery) must never let one turn's read-modify-write of
 * `conversations.bookingState` silently clobber the other's — the
 * classic lost-update race a plain `SELECT` then later `UPDATE` (which
 * is exactly what PersistedConversationManager.loadOrCreate/commitTurn
 * do in isolation) does not protect against on its own.
 *
 * This is solved with ONE mechanism, entirely inside Postgres, requiring
 * no new schema and no new infrastructure: `pg_advisory_xact_lock`, a
 * session-scoped advisory lock keyed by a hash of the CUSTOMER's id,
 * acquired inside a transaction immediately after the customer is
 * resolved (or created) and automatically released when that
 * transaction commits or rolls back. A second, concurrent call for the
 * SAME customer simply blocks at the lock-acquisition statement until
 * the first transaction finishes, then proceeds against the now-current
 * state — no work is lost, message order is preserved, and two
 * DIFFERENT customers never block each other (different hash, no
 * shared lock).
 *
 * Why this over the alternatives:
 *   - An application-level mutex (a JS Map of promises, or similar) only
 *     works within a single process; a second server instance (or even
 *     a second worker) would not see it at all. The mission explicitly
 *     rules this out ("do not introduce ... an application-level mutex
 *     simply because it is familiar") — this is exactly that class of
 *     footgun.
 *   - Redis is unnecessary additional infrastructure for a lock this
 *     codebase's existing database can already provide natively, and is
 *     explicitly ruled out by the mission too.
 *   - A `version` column with optimistic-concurrency retry was
 *     considered, but it needs the ENTIRE ReceptionistAgent turn
 *     (including a live LLM call) re-run on a version conflict — an
 *     advisory lock instead simply makes the second caller WAIT for the
 *     first turn's outcome and then proceed against it, which is both
 *     simpler and strictly more correct for this specific "same
 *     customer's two messages must be applied in order" requirement.
 *   - A `SELECT ... FOR UPDATE` on the conversation ROW was the other
 *     serious candidate, and is equivalent in effect once a conversation
 *     row exists — but it can't protect the case that matters MOST here
 *     (a customer's very first-ever message racing itself, e.g. a
 *     WhatsApp retry, before any conversation row exists to lock at
 *     all). Locking on the CUSTOMER id instead — resolved/created
 *     first, protected by its own unique index — covers both cases with
 *     one primitive.
 *
 * Genuine bug found building this: resolveTenant/resolveCustomer
 * (domain-resolution.ts) recover from a concurrent-insert race by
 * catching the constraint-violation error and re-reading the row — a
 * pattern that only works in AUTOCOMMIT (each statement its own
 * implicit transaction, so one statement's error doesn't affect the
 * next). Called from INSIDE an explicit transaction, that same error
 * poisons the WHOLE transaction (Postgres refuses every further
 * statement with "current transaction is aborted" until it's rolled
 * back), so the very re-read meant to recover from the race instead
 * throws. Fixed by calling resolveTenant/resolveCustomer against the
 * plain, autocommit `deps.db` — exactly how they were built and tested
 * — BEFORE opening the transaction the lock and the rest of the turn
 * live in. This is safe: neither function's OWN concurrency safety
 * depends on being inside this transaction (they're already correct in
 * isolation); the advisory lock's job was never to protect tenant/
 * customer creation, only the find-or-create-conversation +
 * read/process/write bookingState section that follows.
 *
 * Tradeoff, stated plainly (Phase 5 asks for this to be explicit): this
 * holds one Postgres connection/transaction open for the full duration
 * of a turn, INCLUDING any live LLM call ReceptionistAgent makes — a
 * deliberate choice for correctness over raw throughput, appropriate for
 * this product's actual traffic shape (one receptionist, one clinic, not
 * a high-throughput multi-tenant platform). A hash collision between two
 * DIFFERENT customers' ids is possible in principle (hashtext is a
 * 32-bit hash) and would spuriously serialize their turns against each
 * other — never a CORRECTNESS problem (advisory locks don't do anything
 * but block), only a vanishingly rare latency one.
 */

/** Detects and loudly logs the one anomaly this design accepts as a
 * tradeoff rather than "fixing" at the cost of real idempotency — see
 * recordMessage's own docstring in src/db/messages.ts. Never changes
 * behavior (the message is still correctly treated as a duplicate and
 * not reprocessed either way); this exists purely so the case is
 * visible to an operator instead of silently indistinguishable from an
 * ordinary, expected redelivery. */
function logIfCrossConversationCollision(
  whatsappMessageId: string,
  thisConversationId: string,
  existingConversationId: string | undefined,
): void {
  if (existingConversationId && existingConversationId !== thisConversationId) {
    console.error(
      `[whatsapp webhook] SECURITY: whatsappMessageId "${whatsappMessageId}" was already recorded under a ` +
        `DIFFERENT conversation (${existingConversationId}) than the one it was just received for ` +
        `(${thisConversationId}) — this message was NOT processed for the second conversation. Real WhatsApp ` +
        `message ids are unique platform-wide, so this indicates either a forged/replayed payload or a ` +
        `provider-side anomaly; investigate.`,
    );
  }
}

export interface ProcessedInboundMessage {
  /** True when this exact whatsappMessageId was already processed —
   * the caller must send NO outbound reply and take no further action
   * (Phase 4: a retried webhook delivery must never process twice, book
   * twice, or reply twice). */
  wasDuplicate: boolean;
  /** The reply to send back to the customer, or null when there is
   * nothing to send (always null when `wasDuplicate` is true). */
  reply: string | null;
  /** The durable row id of the just-recorded outbound reply message —
   * undefined when `wasDuplicate`/`reply` is null. The caller uses this
   * to mark delivery status (sent/failed) once it actually attempts the
   * send, AFTER this transaction has committed (see updateMessageStatus
   * in src/db/messages.ts and this file's own docstring). */
  outboundMessageId: string | undefined;
  handoffActive: boolean;
  conversationId: string;
  /** True when this message was dropped by rate limiting (see
   * src/whatsapp/rate-limit.ts) before any real processing — never both
   * `wasDuplicate` and `rateLimited` at once. `reply`/`outboundMessageId`
   * are null/undefined whenever this is true: a flood is not made better
   * by replying to every message past the threshold. */
  rateLimited: boolean;
}

export interface WebhookProcessingDeps {
  db: Db;
  business: BusinessContext;
  agent: ReceptionistAgent;
}

/**
 * Processes ONE normalized inbound text message end to end: resolve the
 * customer, acquire the per-customer lock, check idempotency, run the
 * existing ReceptionistAgent, and durably persist the outcome — all
 * inside one transaction. Returns without sending anything; the caller
 * (the webhook route) is responsible for actually dispatching `reply`
 * through a MessagingProvider AFTER this resolves, deliberately OUTSIDE
 * the transaction/lock — an outbound HTTP call has no business holding a
 * database connection open, and a failed send must never roll back an
 * already-committed booking (see Phase 10's failure-boundary
 * requirements, documented further in webhook-route.ts).
 */
export async function processInboundWhatsAppMessage(
  deps: WebhookProcessingDeps,
  input: { phone: string; message: string; whatsappMessageId: string; name?: string },
): Promise<ProcessedInboundMessage> {
  // Resolved against the plain, autocommit db — see this file's own
  // docstring ("Genuine bug found building this") for why these two
  // calls must NOT run inside the transaction below.
  const tenantId = await resolveTenant(deps.db, deps.business);
  const customerId = await resolveCustomer(deps.db, tenantId, input.phone, input.name);

  // Phase 11 abuse protection, checked BEFORE the lock/transaction below
  // — a flood is exactly the scenario where skipping the heavier work
  // (an LLM call, a DB transaction) matters most. See rate-limit.ts's
  // own docstring for why this is a plain DB count, not an in-memory
  // counter or Redis.
  if (await isRateLimited(deps.db, customerId)) {
    const conversation = await findOrCreateActiveConversation(deps.db, tenantId, customerId);
    console.error(`[whatsapp webhook] rate limit exceeded for customer ${customerId} — message dropped`);
    return {
      wasDuplicate: false,
      reply: null,
      outboundMessageId: undefined,
      handoffActive: conversation.status === "staff_owned",
      conversationId: conversation.id,
      rateLimited: true,
    };
  }

  return deps.db.transaction(async (tx) => {
    // See this file's own docstring for why this lock, at this exact
    // point, is the whole Phase 5 concurrency strategy. hashtext() takes
    // any text and returns a stable int4 hash — a UUID string is a
    // perfectly ordinary input for it.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${customerId}))`);

    // Genuine defect found by this hardening pass's own failure-recovery
    // tests: deps.agent's ReceptionistTools (escalate, createLead,
    // requestAppointment, ...) are built ONCE, at router-creation time,
    // bound to the PLAIN outer `db` — a DIFFERENT database connection
    // than `tx`. That's deliberate for the booking tools specifically
    // (createAppointment's exclusion-constraint conflict recovery is a
    // catch-and-recover pattern that only works in autocommit; nesting
    // it inside this transaction would poison the WHOLE turn on an
    // ordinary, expected slot conflict — exactly the
    // resolveTenant/resolveCustomer bug already fixed above, but for
    // booking). The consequence: on a customer's very first-ever
    // message, if that turn's own action is escalate/createLead, its
    // INSERT (via the outer `db`) tries to foreign-key against a
    // conversation row that only exists UNCOMMITTED inside `tx` —
    // invisible across connections — and fails outright. Fixed by
    // ensuring the conversation row is committed via the PLAIN `db`
    // (not `tx`) before the agent ever runs, while still holding the
    // advisory lock acquired above — so a concurrent duplicate-create
    // race is still prevented by the lock, not by a unique constraint
    // this table doesn't have. PersistedConversationManager.loadOrCreate
    // below then just FINDS this already-existing row (via `tx`,
    // harmlessly redundant), same reasoning as the tenant/customer fix.
    await findOrCreateActiveConversation(deps.db, tenantId, customerId);

    // tenantId/customerId are already confirmed to exist by this point,
    // so loadOrCreate's own (redundant, harmless) resolveTenant/
    // resolveCustomer calls inside `tx` always take the plain
    // "found it" read path — never the insert-and-catch path that
    // would poison this transaction.
    const manager = await PersistedConversationManager.loadOrCreate(tx, deps.business, input.phone, input.name);

    const { wasDuplicate, existingConversationId } = await manager.recordInboundMessage(
      input.message,
      input.whatsappMessageId,
    );
    if (wasDuplicate) {
      // Phase 4, non-negotiable: a redelivered message id must not run
      // the agent again, must not execute any action again, and must not
      // send a second reply. Returning here — still inside the same
      // transaction, which simply commits having done nothing further —
      // is what guarantees that.
      logIfCrossConversationCollision(input.whatsappMessageId, manager.conversationId, existingConversationId);
      return {
        wasDuplicate: true,
        reply: null,
        outboundMessageId: undefined,
        handoffActive: manager.getHandoffActive(),
        conversationId: manager.conversationId,
        rateLimited: false,
      };
    }

    const history = await manager.loadHistory();
    const request = {
      ...manager.buildRequest({ customer: {}, history, message: input.message }),
      conversationId: manager.conversationId,
    };

    const result = await deps.agent.handleMessage(request);

    const outboundMessage = await manager.recordOutboundMessage(result.reply);
    await manager.commitTurn(result.bookingState, result.handoffActive);

    return {
      wasDuplicate: false,
      reply: result.reply,
      outboundMessageId: outboundMessage.id,
      handoffActive: result.handoffActive,
      conversationId: manager.conversationId,
      rateLimited: false,
    };
  });
}

const UNSUPPORTED_MESSAGE_REPLY =
  "Sorry, I can only read text messages right now. I've let our team know — they'll follow up with you directly.";

/**
 * Phase 3's "unsupported message types" requirement — an image, audio,
 * location, sticker, etc. must get a safe, honest reply and a real
 * escalation, never a crash and never an attempt to run booking
 * extraction against something that was never text. Deliberately a
 * SEPARATE function from processInboundWhatsAppMessage rather than a
 * branch inside it: this never touches ReceptionistAgent/BookingState at
 * all (there is no "message" to extract fields from), just the same
 * lock-then-persist discipline plus a handoff — mirroring this
 * codebase's existing preference for separate, narrow implementations
 * over one function with many branches (see ReceptionistTools' three
 * implementations).
 */
export async function processUnsupportedInboundMessage(
  deps: WebhookProcessingDeps,
  input: { phone: string; whatsappMessageId: string; name?: string; messageType: string },
): Promise<ProcessedInboundMessage> {
  const tenantId = await resolveTenant(deps.db, deps.business);
  const customerId = await resolveCustomer(deps.db, tenantId, input.phone, input.name);

  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${customerId}))`);

    const manager = await PersistedConversationManager.loadOrCreate(tx, deps.business, input.phone, input.name);

    const { wasDuplicate, existingConversationId } = await manager.recordInboundMessage(
      `[unsupported message type: ${input.messageType}]`,
      input.whatsappMessageId,
    );
    if (wasDuplicate) {
      logIfCrossConversationCollision(input.whatsappMessageId, manager.conversationId, existingConversationId);
      return {
        wasDuplicate: true,
        reply: null,
        outboundMessageId: undefined,
        handoffActive: manager.getHandoffActive(),
        conversationId: manager.conversationId,
        rateLimited: false,
      };
    }

    await manager.createHandoff(`customer sent an unsupported message type (${input.messageType})`, {
      bookingState: manager.getBookingState(),
    });
    const outboundMessage = await manager.recordOutboundMessage(UNSUPPORTED_MESSAGE_REPLY);
    await manager.commitTurn(manager.getBookingState(), true);

    return {
      wasDuplicate: false,
      reply: UNSUPPORTED_MESSAGE_REPLY,
      outboundMessageId: outboundMessage.id,
      handoffActive: true,
      conversationId: manager.conversationId,
      rateLimited: false,
    };
  });
}

/** Sends `reply` through `messaging` and durably records the outcome via
 * recordSendOutcome — a retryable failure is scheduled for the outbound
 * retry worker (src/messaging/outbound-retry-worker.ts) rather than
 * simply marked "failed"; a permanent failure or an exhausted retry
 * budget is marked "failed". Never throws — a send failure is a normal,
 * expected outcome (see MessagingProvider.sendText's own contract), not
 * an exception to propagate. Called AFTER processInboundWhatsAppMessage's
 * transaction has already committed — a failed send here never rolls
 * back the booking/state that turn already produced, which is correct:
 * the booking happened regardless of whether the customer's phone ever
 * received confirmation of it. `currentAttempts` is always 0 here — this
 * is, by construction, the first send attempt for this message; every
 * SUBSEQUENT attempt is made by the retry worker, which reads the row's
 * actual accumulated attempt count instead. */
export async function sendReply(
  db: Db,
  messaging: MessagingProvider,
  to: string,
  reply: string,
  outboundMessageId: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await messaging.sendText(to, reply);
  const status = await recordSendOutcome(db, outboundMessageId, 0, result);
  if (!result.success) {
    console.error(
      `[whatsapp webhook] outbound send failed for ${to} (status: ${status}): ${result.error}`,
    );
  }
  return { success: result.success, error: result.error };
}
