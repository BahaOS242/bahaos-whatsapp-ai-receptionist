import express, { Router, type NextFunction, type Request, type Response } from "express";
import { getEnv, type Env } from "../config/env";
import { getDb } from "../db/client";
import {
  BAHAMAS_DENTAL_SERVICE,
  createAiProvider,
  createLanguageObservationRecorder,
  createReceptionistTools,
} from "../ai/create-provider";
import { createKnowledgeService } from "../knowledge/create-knowledge-service";
import { ReceptionistAgent } from "../ai/receptionist-agent";
import { parseVerificationQuery, parseWebhookPayload } from "../whatsapp/webhook-payload";
import { verifyWebhookSignature } from "../whatsapp/webhook-signature";
import { processInboundWhatsAppMessage, processUnsupportedInboundMessage } from "../whatsapp/webhook-processing";
import { wakeOutboxWorkers } from "../messaging/outbox-worker";
import type { BusinessContext } from "../ai/types";

/**
 * The WhatsApp Cloud API webhook boundary — the ONLY place inbound HTTP
 * requests from Meta enter this codebase. Everything it does before
 * handing off to src/whatsapp/webhook-processing.ts is about making sure
 * a request that ISN'T a genuine, well-formed, authenticated WhatsApp
 * delivery can never reach the receptionist engine at all: verify-token
 * check on GET, signature check + payload normalization on POST. See
 * this file's PHASE 13 note at the bottom for exactly what is and isn't
 * verified against a REAL Meta delivery in this environment.
 *
 * Raw-body signature verification requires the route's OWN json() body
 * parser (with a `verify` callback capturing the exact bytes) mounted
 * BEFORE the app's global express.json() — see app.ts, which mounts this
 * router ahead of that global middleware for exactly this reason.
 *
 * WEBHOOK ACKNOWLEDGEMENT SEMANTICS — the exact rule this file follows,
 * stated once here rather than left implicit across every branch below.
 * Meta treats a non-2xx (or a timeout) as "redeliver this later"; the
 * only thing that matters for correctness is that a message Meta should
 * redeliver actually gets a non-2xx, and a message that was genuinely,
 * successfully handled (including "successfully and intentionally
 * ignored") never does:
 *
 *   200 — the request was received and fully, successfully handled —
 *         including every case where "handled" means "correctly
 *         ignored": a duplicate whatsappMessageId, a delivery-status
 *         update (no `messages`, only `statuses`), a reaction, a
 *         message rejected for an unexpected phone_number_id, or any
 *         payload malformed enough that parseWebhookPayload found
 *         nothing to process at all. None of these should ever cause
 *         Meta to retry — there is nothing a retry would accomplish.
 *   400/413/401 — the REQUEST ITSELF is invalid before any message-level
 *         processing even begins: an unparseable JSON body, an
 *         oversized body, or (401) a signature that doesn't verify.
 *         Retrying the IDENTICAL request would fail identically, but
 *         these are also not Meta's own well-formed traffic in the
 *         first place (a genuine Meta delivery is always parseable,
 *         correctly sized, and correctly signed) — 4xx here mainly
 *         guards against non-Meta senders hitting this endpoint.
 *   500 — a genuine processing failure occurred for a message that WAS
 *         otherwise valid and authenticated (e.g. Postgres unreachable,
 *         an unexpected exception) — the customer's message was NOT
 *         safely handled, and Meta redelivering it is exactly the
 *         correct, safe recovery path (see webhook-processing.ts's
 *         idempotency guarantees for why a redelivery is always safe
 *         regardless of how far the failed attempt got).
 *
 * See tests/whatsapp/webhook-security.test.ts and
 * tests/db/failure-recovery.test.ts for the regression coverage of each
 * of these cases.
 */

export interface WhatsAppWebhookDeps {
  env?: Env;
  // The concrete pool-backed handle (not the bare `Db` type used inside
  // a transaction — see src/db/client.ts's own docstring on why those
  // differ): createReceptionistTools/createLanguageObservationRecorder
  // are top-level, once-per-process factories that need the full
  // `$client`-bearing handle, never a transaction-scoped one.
  db?: ReturnType<typeof getDb>;
  business?: BusinessContext;
  agent?: ReceptionistAgent;
}

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

function rawBodyCapture(req: RequestWithRawBody, _res: Response, buf: Buffer): void {
  req.rawBody = buf;
}

export function createWhatsAppWebhookRouter(deps: WhatsAppWebhookDeps = {}): Router {
  const env = deps.env ?? getEnv();
  const db = deps.db ?? getDb();
  const business = deps.business ?? BAHAMAS_DENTAL_SERVICE;
  const agent =
    deps.agent ??
    new ReceptionistAgent(createAiProvider(env), createReceptionistTools(env, db), createLanguageObservationRecorder(env, db), createKnowledgeService(env, db));

  if (env.NODE_ENV === "production" && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && !env.WHATSAPP_APP_SECRET) {
    // Genuine "accidental insecure default" found in this hardening
    // pass: a configured verify token means this webhook is reachable
    // and expected to receive real Meta traffic, but with no app secret
    // configured, signature verification is silently skipped entirely
    // (see the POST handler below) — every inbound request is trusted
    // with no authenticity check at all. Nothing previously warned an
    // operator this had happened. This is a loud startup warning, not a
    // hard failure — the mission's own Phase 7 requirement is that
    // nothing about WhatsApp configuration is ever mandatory, and a
    // staged rollout (webhook verified, secret added moments later) is
    // legitimate — but it must never be silent.
    console.warn(
      "[whatsapp webhook] WARNING: WHATSAPP_WEBHOOK_VERIFY_TOKEN is configured but WHATSAPP_APP_SECRET is not — " +
        "inbound webhook signature verification is DISABLED in production. Configure WHATSAPP_APP_SECRET to close this gap.",
    );
  }

  const router = Router();
  // Explicit, deliberate limit — Meta's own webhook payloads (even a
  // batch of several messages) are small; this stays generous while
  // bounding the request body a caller can force this process to buffer
  // in memory before rejecting it (Phase 11's "oversized payload"
  // requirement). Previously relied on body-parser's own undocumented-
  // in-this-codebase default (100kb) — making it explicit here means the
  // limit can't silently change out from under this app on a dependency
  // upgrade.
  router.use(
    express.json({
      limit: "256kb",
      verify: rawBodyCapture as (req: Request, res: Response, buf: Buffer) => void,
    }),
  );

  /**
   * Meta's one-time webhook subscription handshake: it calls this with
   * `hub.mode=subscribe`, `hub.verify_token=<whatever you configured in
   * the Meta app dashboard>`, and `hub.challenge=<a random string>`.
   * Responding with the raw challenge value (200, text) is what
   * completes the subscription; anything else must 403. Never succeeds
   * if WHATSAPP_WEBHOOK_VERIFY_TOKEN isn't configured at all — there is
   * nothing correct it could match against.
   */
  router.get("/", (req: Request, res: Response) => {
    const { mode, verifyToken, challenge } = parseVerificationQuery(req.query as Record<string, unknown>);
    if (
      env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      mode === "subscribe" &&
      verifyToken === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      challenge
    ) {
      res.status(200).type("text/plain").send(challenge);
      return;
    }
    res.status(403).json({ error: "verification_failed" });
  });

  /**
   * Real inbound message delivery. Always responds 200 once the request
   * has been authenticated and parsed, REGARDLESS of what happened
   * processing individual messages inside it — Meta interprets a
   * non-200 (or a timeout) as "redeliver this," and this system's own
   * idempotency layer (see webhook-processing.ts) already makes a
   * redelivery safe, so there's no correctness reason to ever make Meta
   * retry, and every reason not to (needless duplicate load). A
   * genuinely malformed/unauthenticated request is rejected BEFORE any
   * processing, with a 4xx, which Meta does not treat as "redeliver."
   */
  router.post("/", async (req: RequestWithRawBody, res: Response, next: NextFunction) => {
    if (env.WHATSAPP_APP_SECRET) {
      const signature = req.header("x-hub-signature-256");
      const bodyForSignature = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
      if (!verifyWebhookSignature(env.WHATSAPP_APP_SECRET, bodyForSignature, signature)) {
        res.status(401).json({ error: "invalid_signature" });
        return;
      }
    }
    // Without WHATSAPP_APP_SECRET configured, signature verification is
    // skipped entirely — see this file's PHASE 13 note: this environment
    // has no real Meta app secret to verify against, so this is
    // documented as an explicit, known gap rather than a false claim of
    // security. Configuring WHATSAPP_APP_SECRET in production closes it.

    // parseWebhookPayload never throws — a body that parsed as SOME JSON
    // value but isn't a valid WhatsApp payload shape (or isn't an object
    // at all) simply yields no messages, handled identically to "nothing
    // to do" below.
    const normalizedMessages = parseWebhookPayload(req.body);

    // WEBHOOK LATENCY DECISION (production-hardening audit): processed
    // IN SEQUENCE, awaited, before responding — KEPT synchronous, not
    // converted to a durable async job queue. Reasoning, per the
    // mission's own "measure before rearchitecting" instruction:
    //
    //   Pipeline: DB work (single-digit ms) -> at most one Anthropic
    //   call (typically 1-3s) -> a booking DB write (single-digit ms) ->
    //   the reply is QUEUED in the same transaction (durable outbox, see
    //   src/messaging/outbox.ts) -> COMMIT -> HTTP 200. THERE IS NO
    //   PROVIDER CALL ON THIS PATH: this router has no messaging provider
    //   at all. Delivery belongs entirely to the outbox worker, which is
    //   merely woken (fire-and-forget, after the response has been sent —
    //   see wakeOutboxWorkers) so replies still leave within milliseconds.
    //   Realistic total: low seconds,
    //   comfortably inside Meta's own webhook delivery timeout budget.
    //
    //   The ONE genuine unbounded-latency risk this audit found — the
    //   Anthropic SDK's own defaults (10-minute timeout, 2 automatic
    //   retries) could have held this request, and the per-customer
    //   advisory-locked transaction it runs inside, open for up to
    //   ~30 minutes during an LLM provider outage, with every Meta
    //   retry for the same customer piling up blocked on the same lock
    //   — is FIXED at the source (AnthropicChatClient now configures a
    //   bounded timeout/retry count — see its own docstring), not by
    //   reaching for async processing to paper over an unbounded call.
    //
    //   A durable async job queue was considered and rejected FOR NOW:
    //   it would need a new job table, a claiming/SKIP LOCKED worker,
    //   and — critically — a way to preserve per-customer ORDERING
    //   across decoupled enqueue/process times that today falls out for
    //   free from holding the advisory lock for the whole synchronous
    //   turn. That is real, new complexity and new correctness surface
    //   to get right, for a workload (one clinic, not high-throughput)
    //   that doesn't need it. Awaiting synchronously also means a
    //   processing failure is caught HERE, in one place, as a normal
    //   try/catch — never an unhandled rejection from a detached
    //   background promise — and this system's own idempotency (see
    //   webhook-processing.ts) already makes a Meta-triggered
    //   redelivery of a slow-but-still-processing message safe
    //   regardless.
    //
    //   Known, documented limitation: total request latency still
    //   depends on Anthropic's response time. Normal operation is fast;
    //   a slow LLM response makes this webhook response correspondingly
    //   slower (bounded now, not unbounded) rather than invisible to
    //   the customer via a fire-and-forget ack. Revisit if real traffic
    //   ever demonstrates this is actually a problem — not before.
    //
    // FAILURE RECOVERY (production-hardening audit): a genuine exception
    // here — Postgres unreachable, or any other infrastructure failure —
    // used to be caught and logged, then this handler STILL responded
    // 200. That is a real bug, not a safety margin: 200 tells Meta
    // "delivered successfully," so Meta never retries, and a message
    // that failed because the DATABASE was briefly down is then LOST
    // FOREVER rather than merely delayed. Fixed by letting a genuine
    // processing exception propagate to Express's error-handling
    // middleware (app.ts), which reports 500 — Meta's documented
    // response to treat as "redeliver this." That redelivery is safe
    // regardless of how far the failed attempt got: this system's own
    // idempotency (messages.whatsapp_message_id) means any message that
    // WAS already durably recorded before the failure is correctly
    // recognized as a duplicate on retry, and any message that never
    // reached recording is genuinely (and safely) reprocessed from
    // scratch. A batch of several messages where only one throws still
    // attempts every other message first (never abandons the whole
    // batch on the first failure) — the error is only surfaced (and 500
    // returned) once every message in this delivery has been attempted.
    let firstError: unknown;
    let queuedAny = false;
    // After the response (success OR error) has been flushed, wake the
    // worker if any reply was committed to the outbox. Never delivers,
    // never awaited, never on the request path.
    res.once("finish", () => {
      if (queuedAny) wakeOutboxWorkers();
    });
    for (const message of normalizedMessages) {
      try {
        if (await handleOneMessage(message)) queuedAny = true;
      } catch (error) {
        console.error("[whatsapp webhook] error processing message (will trigger a Meta retry):", error);
        firstError ??= error;
      }
    }

    if (firstError) {
      next(firstError);
      return;
    }
    res.status(200).json({ status: "received" });
  });

  /** Returns true when a reply was durably queued in the outbox. */
  async function handleOneMessage(
    message: ReturnType<typeof parseWebhookPayload>[number],
  ): Promise<boolean> {
    // TENANT/ACCOUNT ARCHITECTURE — audited, deliberately NOT built out
    // further this pass. schema.ts's `whatsapp_accounts` table is a
    // Phase 1 scaffold for a future phoneNumberId -> tenant lookup, but
    // nothing in this codebase ever WRITES a row into it (there is no
    // "onboard a new business" flow yet) — so a lookup against it today
    // would always miss, and "implementing the minimum safe lookup path"
    // against a table nothing populates would mean also inventing the
    // tenant-onboarding flow that's supposed to populate it, which is
    // exactly the "huge multi-tenant platform" the mission says not to
    // build. This app resolves EXACTLY ONE tenant (resolveTenant, keyed
    // off BAHAMAS_DENTAL_SERVICE's own name — see domain-resolution.ts),
    // always, regardless of which phoneNumberId a message claims — so
    // there is currently no SECOND tenant a message could ever be
    // misrouted into. The security property that actually matters at
    // this stage — "an inbound message must never see another
    // business's data" — reduces to "an inbound message must never be
    // accepted for a phone number that isn't THIS deployment's own,"
    // which is exactly what this check enforces: a webhook payload
    // claiming a DIFFERENT destination number is either misconfigured
    // (the same Meta app forwarding another number's traffic here) or
    // spoofed, and is rejected before it ever reaches tenant/customer
    // resolution. Within the single tenant, CUSTOMER-level isolation
    // (two different phone numbers never seeing each other's
    // conversation/bookingState) is enforced by resolveCustomer's own
    // unique index and is covered by tests/db/tenant-isolation.test.ts.
    // Adding a second real tenant later means wiring an actual
    // onboarding flow that writes `whatsapp_accounts` AND replacing this
    // single-value comparison with a real lookup — both left for
    // whenever a second tenant is a genuine, funded requirement, not
    // spec-built now against nothing.
    // Genuine gap found alongside the failure-recovery audit: this used
    // to only reject an EXPLICIT mismatch — a message with NO
    // phoneNumberId at all (missing `metadata`/`metadata.phone_number_id`
    // entirely) skipped this check completely and was processed anyway.
    // A real Meta delivery always includes this; its absence, once a
    // specific number IS configured, is itself a sign of a malformed or
    // spoofed payload and must be rejected the same way a mismatch is —
    // never silently processed as if it belonged to this tenant.
    if (env.WHATSAPP_PHONE_NUMBER_ID && message.phoneNumberId !== env.WHATSAPP_PHONE_NUMBER_ID) {
      // displayPhoneNumber is logged purely for operator readability
      // (e.g. "+1 650-555-1234") — the actual security decision above
      // is made entirely on the stable phoneNumberId, never this.
      console.error(
        `[whatsapp webhook] rejected message for unexpected phone_number_id "${message.phoneNumberId ?? "(missing)"}"` +
          (message.displayPhoneNumber ? ` (display number: ${message.displayPhoneNumber})` : ""),
      );
      return false;
    }

    const phone = `+${message.from}`;

    // Genuine reliability gap found auditing this against real-world
    // WhatsApp usage: a customer tapping an emoji reaction (👍, ❤️, ...)
    // on a PREVIOUS message — extremely common, low-signal, and entirely
    // expected — used to be routed through the exact same path as a
    // genuinely unsupported message (image, location, ...): a support
    // escalation PLUS a "sorry, I can only read text messages" reply.
    // In real usage this would flood staff with pointless handoffs and
    // send customers a confusing reply to a simple thumbs-up. A reaction
    // carries no actionable content at all, so it's acknowledged (200)
    // and otherwise ignored — never escalated, never replied to, never
    // even durably recorded (nothing about it needs to be remembered).
    // This does not touch how any OTHER unsupported type (image,
    // location, interactive, ...) is handled — those still correctly
    // escalate, matching Phase 3's original requirement for content a
    // human genuinely might need to look at.
    if (message.unsupportedType === "reaction") {
      return false;
    }

    if (message.unsupportedType) {
      const outcome = await processUnsupportedInboundMessage(
        { db, business, agent },
        {
          phone,
          whatsappMessageId: message.whatsappMessageId,
          name: message.profileName,
          messageType: message.unsupportedType,
        },
      );
      return !outcome.wasDuplicate && !!outcome.reply && !!outcome.outboundMessageId;
    }

    if (!message.text) return false; // unreachable in practice — text is always set unless unsupportedType is

    const outcome = await processInboundWhatsAppMessage(
      { db, business, agent },
      {
        phone,
        message: message.text,
        whatsappMessageId: message.whatsappMessageId,
        name: message.profileName,
      },
    );
    return !outcome.wasDuplicate && !!outcome.reply && !!outcome.outboundMessageId;
  }

  return router;
}

/**
 * PHASE 13 — REAL PROVIDER BOUNDARY, stated once here rather than
 * scattered across comments:
 *
 * Verified in THIS environment (no real Meta credentials configured —
 * see .env's commented-out WHATSAPP_* lines): payload parsing/
 * normalization against hand-built fixtures matching Meta's documented
 * schema (text, reactions, unsupported types, statuses, multi-entry,
 * malformed/oversized), GET verification logic (including Express's
 * OWN actual query-string parsing of Meta's dotted hub.* params, checked
 * empirically, not assumed), signature CORRECTNESS against a published,
 * independent HMAC-SHA256 test vector (RFC 4231 — not merely self-
 * consistency between this file and its own test's signer), outbound
 * Graph API request construction against mocked HTTP responses
 * (endpoint, auth header, digits-only recipient format, bounded
 * timeout, retryable-error classification including Meta's documented
 * rate-limit error codes), malformed-payload handling, idempotency
 * (including lead/escalation actions specifically, not just bookings),
 * per-customer concurrency, and the full webhook -> persistence ->
 * ReceptionistAgent -> tools -> mock-outbound path. See META_SETUP.md's
 * own "Verified locally vs. verified against live Meta" section for the
 * complete, itemized list with test-file references.
 *
 * NOT verified, and NOT claimed: that Meta's real webhook delivery
 * matches these fixtures byte-for-byte, that a real X-Hub-Signature-256
 * header from Meta verifies against this exact implementation, that
 * outbound sends reach a real device, or that a real
 * WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN pair authenticates
 * successfully against graph.facebook.com. Those require real
 * provider credentials this environment does not have — live Meta
 * traffic remains untested.
 */
