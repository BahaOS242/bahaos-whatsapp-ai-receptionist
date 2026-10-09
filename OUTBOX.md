# Durable WhatsApp Outbound Messaging (the Outbox)

> **BahaOS owns the business decision. Postgres owns the durable outbound
> state. The worker owns delivery. Meta owns transport. Future integrations
> consume business events; they do not control the receptionist.**

If BahaOS decides to send a WhatsApp message, that message cannot disappear
because the process, the network, or Meta temporarily failed.

## Architecture

```
 customer ─► WhatsApp ─► webhook ─► conversation engine ─► response decision
                                         │
                       ┌─────────────────┴──────────────────┐
                       │   ONE TRANSACTION  (then COMMIT)   │
                       │   business state  +  outbox row    │
                       └─────────────────┬──────────────────┘
                                         │
                                  HTTP 200 to Meta      ◄── the request path ends HERE
                                         │
                           (fire-and-forget wake-up signal)
                                         ▼
                      outbox worker (poller, any process) ──► Meta API
                                    │
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
                SENT           RETRY_WAIT        DEAD_LETTER
                              (bounded backoff)  (permanent / exhausted)
```

There is **no provider call on the webhook request path at all**: the route has
no messaging provider (it is not even a dependency), and the only coupling to
delivery is `wakeOutboxWorkers()`, a fire-and-forget signal sent *after* the
HTTP response has been flushed. Nothing in the conversation engine, the agent,
the providers or the tools calls Meta. The **only** code that calls `MessagingProvider.sendText` is
`src/messaging/outbox-worker.ts`, and only `whatsapp-messaging-provider.ts`
talks to the Graph API — both enforced by a test that scans `src/` and
`scripts/` (`tests/messaging/outbox-policy.test.ts`).

## Lifecycle

| State | Meaning |
|---|---|
| `pending` | Persisted, waiting for a worker. |
| `processing` | Atomically claimed under a time-limited **lease**. |
| `retry_wait` | A transient failure; scheduled for `available_at`. |
| `sent` | Meta accepted it (2xx). `provider_message_id` stored when Meta returned one. |
| `dead_letter` | Will not be retried automatically; needs inspection. |

```
pending ─claim─► processing ─accepted─────────────────────────► sent
   ▲                 ├─ transient, attempts left ─► retry_wait ─claim─► processing
   │                 ├─ permanent ────────────────────────────────────► dead_letter
   │                 ├─ transient, attempts spent ────────────────────► dead_letter
   │                 └─ worker died: lease expires ─► re-claimed (or dead_letter if no attempts left)
```

`messages` stays the conversation log. Its `status` / `outbound_attempts` /
`next_retry_at` / `last_error` are mirrored from the outbox in the same short
transaction as each outcome, so existing observability keeps working.

## Database (migration `0008_durable_outbox`)

`outbox_messages`: `id`, `tenant_id`, `conversation_id`, `customer_id`,
`message_id` (the log row), `channel` (`whatsapp`) / `provider` (`meta_cloud`) /
`message_type` (`text`), `recipient` (snapshot, `+`-prefixed E.164), `payload`
(`{body}`), `status`, `idempotency_key`, `seq` (bigserial — the ordering key),
`attempt_count`, `max_attempts`, `available_at`, `claimed_at`,
`lease_expires_at`, `claim_token`, `last_attempt_at`, `sent_at`, `failed_at`,
`provider_message_id`, `last_error`, `error_code`, `error_metadata`,
`created_at`, `updated_at`.

* `UNIQUE (tenant_id, idempotency_key)` and `UNIQUE (message_id)` — the
  database enforces "one logical message, one row".
* Partial indexes for the worker's two scans (due rows; expired leases) and for
  the ordering gate (open rows per conversation).
* The migration also **carries over** any message still waiting in the *old*
  retry state (`messages.status = 'retry_pending'`) into the outbox, so an
  in-flight retry is not stranded by the deploy.

## Worker behaviour

**Claim** — one atomic statement: choose due rows `FOR UPDATE SKIP LOCKED`,
flip them to `processing`, set a lease and a fresh `claim_token`, and return
exactly the rows this worker now owns. Eligible: `pending`; `retry_wait` whose
`available_at` has arrived; `processing` whose lease has **expired**
(abandoned by a dead worker — recovery needs no separate reaper to race with).
There is no select-then-process-later.

**Transactions** — claiming is one short statement; the provider call happens
with **no transaction open**; each outcome is one short transaction. Meta is
never awaited while a database transaction is held. (The one deliberate
coupling is the opposite direction: the business state and the outbox row
share a transaction — that is the point.)

**Retries** — only a failure the provider marks `retryable` is retried (the
existing classification is the *sole* input; there is no second taxonomy; an
unclassified failure is treated as permanent, the long-standing safe default).
Schedule (unchanged from the previous mechanism, now with jitter):

| failed attempt | wait before next | 
|---|---|
| 1 | 30 s |
| 2 | 60 s |
| 3 | 120 s |
| 4 | 240 s |
| 5 | → `dead_letter` (exhausted) |

Each delay gets ±20 % jitter so conversations that failed together during a
Meta outage do not retry in lockstep. Attempt counts include recovery attempts.

**Crash recovery** — a claim is a lease (120 s). If the worker dies, nothing
happens until the lease expires; then the next pass re-claims the row. A row
whose lease expires *on its final allowed attempt* is dead-lettered instead of
re-claimed forever (a message that keeps killing its worker).

**Avoiding self-inflicted duplicates** — a worker will not *start* a send
unless ≥ 25 s of its lease remain (provider timeout 15 s + slack), and every
provider call is capped by a 20 s hard ceiling. A stalled worker that wakes up
after its lease was recovered is **fenced**: outcomes are written
`WHERE status='processing' AND claim_token = <mine>`, so it cannot overwrite the
newer attempt (it is reported as `lostLease`).

**Concurrency** — any number of workers/processes may run; the database
decides ownership. Tested with 5 workers racing for one message and 3 workers
over 20 messages (each sent exactly once), plus a liveness test that a worker
never waits behind another worker's row lock.

## Ordering

The ordering key is the **conversation**. A row is claimable only if no
*earlier* (`seq`) row of the same conversation is still `pending`,
`processing` or `retry_wait`. So within one conversation messages go out one at
a time, in order ("Absolutely, I can help" always before "What day works best
for you?"), and a failing message holds back **that conversation only** —
other customers are never blocked. `sent` and `dead_letter` are terminal and
release the line, so one undeliverable message does not silence a customer
forever.

## Idempotency — what is and is not guaranteed

* **Guaranteed (application level):** one logical outbound message = one
  idempotency key = one outbox row, enforced by a unique index. The key for a
  reply is `reply:<inbound message row id>`; re-processing a redelivered
  webhook is already a no-op earlier in the pipeline and would be again here.
  Five simultaneous enqueues of the same reply produce one row and one
  delivery.
* **Guaranteed:** the worker never creates a second row or second log message
  when retrying; every attempt updates the same row.
* **Delivery is durable AT-LEAST-ONCE, not exactly-once.** The WhatsApp Cloud
  API has no idempotency key for sends, so a duplicate is possible in exactly
  these windows, all tested and all recorded:
  1. **Ambiguous failure** — a timeout / dropped connection / 5xx after Meta
     may have already accepted the message. It is retried; the failure is
     stored with `error_metadata.ambiguous = true`.
  2. **Crash after Meta accepted, before we recorded `sent`** — the lease
     expires and the message is re-sent.
  3. **Lost-lease worker** — mitigated (margin + fencing) but not impossible
     if a worker stalls *during* a send.
  We deliberately choose a possible duplicate over a lost reply.
* A 2xx whose body has no usable message id is a **success** (2xx is Meta's
  acceptance signal); it is stored as `sent` with
  `error_metadata.acceptedWithoutProviderId = true`.

## Meta integration — preserved, extended

Unchanged: `+` stripped for the recipient, bearer auth, 15 s timeout, malformed
2xx handled, the documented transient Meta error codes (4, 80007, 130429,
131048, 131056) under HTTP 400, no-throw contract, reaction handling, webhook
signature/phone-number-id validation. Added to the provider result (additive):
`errorCode` (`network_timeout` | `network_error` | `http_<status>` |
`meta_<code>`), `ambiguous`, `httpStatus`, `metaCode` — for inspection only; the
retry decision still reads `retryable` alone.

## Dead-letter requeue

`requeueDeadLetter(db, { tenantId, outboxId | messageId, requestedBy? })`
(`src/messaging/outbox-requeue.ts`). Exact semantics:

* **Same message, same row.** It resets the existing row — same outbox id,
  idempotency key and `messages` log row. It never inserts, so one logical
  message cannot become two, and the unique indexes make a second row
  impossible.
* **Only `dead_letter` can be requeued**, via one conditional `UPDATE … WHERE
  status = 'dead_letter'`. Concurrent requeues have exactly one winner; every
  other call — including a repeat — returns `not_dead_letter` and changes
  nothing.
* **Tenant-owned.** Another tenant's row is reported as `not_found`
  (existence is not leaked).
* **Retry state:** `attempt_count` restarts at 0 (a fresh, still-bounded
  `max_attempts` budget), `available_at` = now, failure timestamp and
  claim/lease cleared (the next claim mints a new fencing token, so no earlier
  worker can ever write to it), `requeue_count` + 1.
* **History is preserved**, appended to `error_metadata.history` (previous
  attempt count, error code/text, failure time, dead-letter reason, who, when)
  and to `audit_events` in the same transaction. Every later outcome write
  keeps that history; `last_error` / `error_code` keep showing the last failure
  until a delivery succeeds.
* **Ordering:** the row keeps its original position, so it returns to the head
  of its conversation and any *unsent* later message waits behind it. A later
  message that was **already sent** (a dead letter releases the line) cannot be
  un-sent: the result reports `outOfOrder: true`.

### When a requeued message fails again

It goes through the exact same lifecycle as any message, on its fresh budget
(it is not special-cased):

* **Transient failure** → `retry_wait` with the normal 30s / 60s / 120s / 240s
  jittered backoff, attempt count 1, 2, 3… from the reset.
* **Permanent failure, or the 5 fresh attempts spent** → `dead_letter` again,
  with a new `failed_at` and a new `deadLetterReason`.
* `requeue_count` is **not** reset; it keeps counting operator requeues.
* `error_metadata.history` is **never** truncated: each requeue appends one
  entry, so after N requeues it holds N entries, oldest first, each recording
  the failure that preceded it. Requeueing a message that died again is
  allowed and works exactly like the first requeue.
* Nothing loops automatically: a dead letter stays dead until a person
  requeues it, so a permanently bad message cannot cycle forever.

## Observability — "why didn't this customer get this message?"

`src/messaging/outbox-inspection.ts`: `inspectOutbound` (by outbox id, log
message id, or tenant + idempotency key) and `listOutbound` (e.g. all dead
letters). Each returns message id, tenant, conversation, recipient, status,
created time, attempt count, last attempt, **next attempt**, claim/lease
times, provider message id, last error, error code, error metadata and a
one-sentence `explanation`. Tenant-scoped.

## How it is proven

* `tests/db/outbox-worker.test.ts`, `outbox-integration.test.ts`,
  `outbox-requeue.test.ts` — lifecycle, retries, idempotency, leases, fencing,
  ordering, tenant isolation, observability, requeue (many connections, one
  process).
* `tests/db/outbox-multiprocess.test.ts` — **separate OS processes** (`node
  --import tsx` children, each with its own pool and event loop, sharing only
  PostgreSQL): 4 processes × 2 worker loops over 96 messages / 24 conversations
  (each sent exactly once, strictly ordered per conversation, across
  processes); concurrent enqueue idempotency from 4 processes; tenant
  isolation; one conversation not blocking another; SIGKILL of a worker
  mid-claim then lease recovery; cross-process fencing (finished-row and
  in-flight-claim variants); liveness (a worker never waits behind another
  process's row lock).
* `tests/messaging/outbox-policy.test.ts` — the retry policy, and a scan that
  proves the route/transaction code cannot reach a provider and that only the
  worker calls `sendText`.

## Operating it

* The in-process poller (`startOutboxPoller`, started by `src/server.ts`) polls
  every `OUTBOUND_RETRY_POLL_INTERVAL_MS` (default **5000**; the variable name
  is kept for compatibility) and is also **woken immediately** when the webhook
  commits a reply (`wakeOutboxWorkers`, sent after the 200 is flushed), so a
  reply normally leaves within milliseconds. If the wake-up is lost (the
  process died), the poll picks the row up within seconds. A slow or hung Meta
  can no longer delay, or fail, any webhook response.
* Scaling = running more web processes. No Redis/BullMQ was needed: Postgres
  `SKIP LOCKED` + leases are sufficient at this scale.
* `scripts/simulate-whatsapp.ts` now delivers through the same outbox path.

## Known limitations

* **Duplicates are possible** in the three windows above.
* **Requeue is service-level only** (no UI/CLI): `requeueDeadLetter`.
* With **no worker process running**, replies simply wait (durably) — a deployment must run the server (which starts the poller) or another worker process.
* Using the **mock transport in production** (unset WhatsApp credentials)
  *consumes* queued messages and marks them `sent` without reaching a phone —
  never use it to "pause" real traffic.
* Delivery/read **status webhooks** are still ignored (so `sent` means
  "accepted by Meta", not "delivered to the handset").
* Only WhatsApp **text** messages; the model is channel-aware but no other
  channel/type exists.
* The legacy `messages.outbound_attempts` / `next_retry_at` columns are kept
  (mirrored) but no longer drive anything.

## Backlog (not built, on purpose)

Delivery-status webhooks (`delivered` / `read`);
metrics/alerting on dead letters and queue age; a proper pause switch for the
worker; templates/media; business-event emission for external integrations
(Zapier/CRM) — the outbox is a separate concern from those events and does not
block them.
