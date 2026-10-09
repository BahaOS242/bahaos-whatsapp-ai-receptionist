# Durable Background Jobs (Phase 5)

PostgreSQL is the source of truth. At-least-once execution. No new infrastructure.
Behind `JOBS_ENABLED` (default **off**).

## 1. Audit of what exists

| Concern | Today |
|---|---|
| Worker | `src/messaging/outbox-worker.ts`: in-process poller started by `server.ts`, wake-up via in-process listeners, `setInterval` backstop (`OUTBOUND_RETRY_POLL_INTERVAL_MS`), graceful `stop()` that awaits in-flight work. |
| Claiming | One `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)` that sets `status='processing'`, bumps `attempt_count`, mints `claim_token` (fencing) and `lease_expires_at`. |
| Recovery | Expired-lease rows are re-claimable; a row whose lease expired on its last attempt is dead-lettered. |
| Fencing | Every outcome write is `WHERE id AND status='processing' AND claim_token=…`; 0 rows ⇒ `lost_lease`, nothing overwritten. |
| Retry | Pure `decideAfterFailure` + jittered `backoffSeconds`; permanent vs transient classification; dead letter; operator requeue (`outbox-requeue.ts`) preserves identity, appends history, audits. |
| Transactions | Enqueue happens inside the business transaction (`enqueueOutboundMessage(tx, …)`). Delivery never holds a transaction. |
| Idempotency | `UNIQUE (tenant_id, idempotency_key)`. |
| Locks | `pg_advisory_xact_lock(hashtext(customerId))` in the webhook; row locks for ownership. |
| Scheduling | Only the outbox's `available_at` backoff. Nothing else delayed. |
| Process model | Single `node dist/server.js` (Railway); the worker runs inside the web process; many processes are safe. |
| Config | zod env schema, boolean flags as `"true"/"false"` defaulting to off. |
| Tenant isolation | `tenant_id` on every row, every admin function tenant-scoped, foreign ids ⇒ not-found. |

## 2. Decision: separate table, shared patterns

The outbox is **message-specific**: per-conversation ordering (`seq` head-of-line blocking), a recipient, a `messages` log row mirrored on every transition, provider failure classification, AI-vs-staff `origin`, human-ownership withdrawal. A generic job does none of that, and forcing it into the outbox would either leak job concerns into the delivery path (risking the healthy, tested WhatsApp pipeline) or weaken the outbox's ordering guarantees.

Alternatives considered:
- *Extend the outbox with a `kind` column* — rejected: couples job retries/timeouts to message ordering and to `messages`; every outbox query and index would need a kind filter.
- *Redis/BullMQ/Temporal* — rejected: a second source of truth, no transactional enqueue with business state, new operational surface; Postgres already gives us everything required.
- *`pg_cron`/LISTEN-NOTIFY* — not needed; polling plus an in-process wake-up is the proven local pattern.

So: **one new table (`background_jobs`) and one history table (`background_job_attempts`)** that reuse the outbox's *mechanics* (SKIP LOCKED claim, lease, fencing token, jittered backoff, requeue-with-history), not its code or table. **Customer messaging stays in the outbox**: a job that must message a customer enqueues through `enqueueOutboundMessage` inside its own transaction; no job handler calls Meta, and `src/jobs/` imports no messaging provider (enforced by a test).

## 3. Schema

`background_jobs`: `id, tenant_id (FK), job_type, payload_version, payload (jsonb), payload_hash, status (pending|running|completed|failed|cancelled), run_at (UTC instant), attempt_count, max_attempts, lease_owner, lease_expires_at, claim_token, idempotency_key, requeue_count, result (jsonb, safe summary), error_code, last_error, started_at, completed_at, failed_at, cancelled_at, created_at, updated_at`.

- `UNIQUE (tenant_id, idempotency_key)`.
- Partial indexes: due (`run_at WHERE status='pending'`), lease (`lease_expires_at WHERE status='running'`), `(tenant_id, status, run_at)`.
- CHECKs: `attempt_count >= 0`, `max_attempts >= 1`, a `running` row always carries `claim_token` and `lease_expires_at`.
- `background_job_attempts` (append-only): `job_id, tenant_id, attempt, outcome (completed|retry|failed|lease_lost|skipped…), error_code, started_at, finished_at, duration_ms`. Safe metadata only — never payloads or provider bodies.

## 4. Lifecycle

```
pending ──claim──► running ──handler ok──────────────► completed   (result may say "skipped: <reason>")
   ▲                  │ transient failure, attempts left ──► pending (run_at = now + backoff)
   │                  │ permanent failure / attempts spent ─► failed
   │                  └ lease expired (worker died) ───────► re-claimed (or failed if no attempts left)
pending ──cancel──► cancelled                failed ──requeue──► pending (same id, history kept)
```
No extra statuses: "retrying" is `pending` with `attempt_count > 0`; "skipped" is `completed` with a result.

## 5. Guarantees

- **At-least-once**, never exactly-once. A worker can crash after a side effect and before recording completion; the job re-runs. Handlers MUST be idempotent and use a stable operation id (`job.id` + step) as the idempotency key for any provider call. A timed-out handler may still be running; fencing protects the job row, not external effects.
- **Transactional enqueue**: `enqueueJob(tx, …)` joins the caller's transaction; rollback removes the job. Same `(tenant, idempotency_key)` + same type/version/payload ⇒ the existing job (deduplicated); different ⇒ `JobIdempotencyConflictError`.
- **Fencing**: `claim_token` is minted per claim; every outcome/heartbeat write requires it.
- **No early execution**: eligibility is `run_at <= now`; instants are UTC. `localTimeToUtc` converts a business-local wall time (DST-aware: nonexistent times move forward, ambiguous times use the first occurrence).
- **Registry only**: payloads never name code. Unknown type or unsupported payload version is rejected at enqueue; workers claim only types they have registered (so an older worker never kills a newer deployment's jobs).
- **Business-state safety**: handlers re-check authoritative state before any effect; `src/jobs/guards.ts` provides reusable checks (conversation allows automation, appointment still active, customer consent, memory not removed since).

## 6. Process model

Workers run **inside the existing web process** (matching the outbox and Railway's single start command) when `JOBS_ENABLED=true`, and optionally as a separate process: `npm run worker` (`dist/worker.js`) for isolation. Many processes may run at once. Disabled ⇒ no polling, no claims; enqueue still works (jobs wait). `JOBS_ENABLED` is independent of `MEMORY_ENABLED` and of the outbox.

## 7. Handler registry

`src/jobs/registry.ts` is the only execution path. A definition names: `type`, payload `version`, a zod `schema`, the `handler`, `maxAttempts`, optional `backoffSeconds`, a hard `timeoutMs`, and a required `idempotency` statement (why a re-run is safe). Registration validates all of it. Production registry (`default-registry.ts`): `memory.expire_sweep` only. Test handlers live under `tests/` and are passed to the worker explicitly.

Handler contract (`JobContext`): `tenantId` is the ONLY tenant the handler may touch; `operationId` (`job:<id>`) is stable across retries and is the idempotency key for any provider/outbox call; `signal` aborts on timeout or shutdown; `heartbeat()` extends the lease (false ⇒ lease lost, stop). Return `{ skipped: "reason" }` when business state no longer permits the action (job completes, result records why). Throw `TransientJobError`/`PermanentJobError` for classified failures; any other exception is treated as transient and only its class name is stored.

## 8. Retry policy

Default backoff base seconds `[15, 30, 60, 120, 300, 600, 900]` by attempt, capped at the last entry, ±20 % jitter; per-type override. Transient failure with attempts left ⇒ `pending` with `run_at = now + backoff`; attempts spent or permanent ⇒ `failed`. Handler timeout ⇒ transient `handler_timeout`. A lease that expires on the final allowed attempt ⇒ `failed` (`lease_expired_exhausted`). Unsupported payload version / invalid stored payload ⇒ permanent failure without executing.

## 9. Lease and fencing

Claim = one statement (`SELECT … FOR UPDATE SKIP LOCKED` → `UPDATE`): status `running`, `attempt_count + 1`, `lease_owner`, fresh `claim_token`, `lease_expires_at = now + lease` (default 120 s). Only types in the worker's registry are claimed. Every later write (complete, retry, fail, heartbeat) requires `status='running' AND claim_token=<mine>`; zero rows ⇒ `lost_lease` and nothing is overwritten. A stale worker's *external* effects cannot be fenced, hence the at-least-once contract. No transaction is held while a handler runs. A worker refuses to start if a type's `timeoutMs` is not safely below the lease.

## 10. Process lifecycle and deployment

- Flags: `JOBS_ENABLED` (default **false**), `JOBS_POLL_INTERVAL_MS` (5000, min 250), `JOBS_CONCURRENCY` (4, 1–32). Independent of `MEMORY_ENABLED` and of the WhatsApp outbox, which still starts unconditionally.
- **Development**: `JOBS_ENABLED=true npm run dev` (worker runs in the web process) or `npm run jobs -- …` to inspect.
- **Production (current Railway single process)**: set `JOBS_ENABLED=true`; the web process runs the worker, many replicas are safe. **Isolation option**: `npm run build && JOBS_ENABLED=true npm run worker` as a second service (refuses to start when the flag is off).
- Shutdown: SIGTERM/SIGINT ⇒ stop claiming, wait up to 20 s for in-flight jobs, then abort their signals; anything unfinished is recovered by lease expiry. Polling backs off exponentially (0.5 s → 30 s) on database errors and never crashes; state lives in Postgres so nothing is lost.
- Backpressure: a process never has more than `JOBS_CONCURRENCY` handlers running and claims only the free capacity.
- Staging first: apply migration `0012` (additive), enable the flag in staging, enqueue `memory.expire_sweep` with `npm run jobs -- enqueue-memory-sweep <tenant>`, watch the `{scope:"jobs"}` log lines.

## 11. Time

All instants are UTC (`timestamptz`); eligibility is `run_at <= now`. `localTimeToUtc(timeZone, {y,m,d,h,mi})` converts a business-local wall time: a nonexistent time (spring-forward gap) resolves just after the gap, an ambiguous time (fall-back) to its first occurrence; independent of the server's timezone. No recurring scheduler exists — a periodic caller must enqueue with a bucketed idempotency key (e.g. `memory.expire_sweep:2026-10-09`) so duplicates collapse.

## 12. Operations

- Inspect (tenant-scoped; lists never include payloads): `listJobs` views `pending | scheduled | running | retrying | failed | completed | cancelled`, `jobCounts`, `getJob` (payload + attempt history). CLI: `npm run jobs -- list|show|cancel|requeue|enqueue-memory-sweep <tenant-slug> …`.
- **Cancel**: only a `pending` job. A running or finished job is not cancellable (its handler may already have acted). Audited (`job.cancelled`).
- **Manual requeue**: only a `failed` job; same id and idempotency key, `attempt_count` reset, `run_at = now`, `requeue_count + 1`, attempt history and audit preserved, the last error stays visible until success. Exactly one concurrent requeue wins. Requeue re-schedules only — the handler re-runs its business-state guards.
- Guards (`src/jobs/guards.ts`): `conversationAllowsAutomation`, `appointmentIsActive`, `customerMayBeContacted`, `memorySlotNotRemovedSince`.
- Stuck work: `running` jobs with a past `lease_expires_at` are recovered by the next claim; `failed` jobs are the dead-letter list.
- Logs: `{scope:"jobs", event, jobId, tenantId, type, attempt, durationMs, reasonCode, …}`. Never payloads, results, message text or provider bodies.

## 13. Known limitations

- At-least-once only: a handler can run again after a crash following its side effect. Use `operationId` for every provider call.
- A handler that exceeds its deadline is aborted via `signal` but may keep running if it ignores it.
- No recurring/cron scheduler, no priorities, no per-type concurrency limits, no job dependencies.
- No dashboard or HTTP API; inspection is service functions and the CLI.
- `background_job_attempts` has no tenant/job composite FK (written only by the engine, always with the job's tenant).
- `lease_expires_at`/`run_at` compare against the worker's clock; keep hosts NTP-synced.
- Only one real job type exists; reminders, follow-ups and any customer messaging are intentionally not implemented.
- Live Meta, TLS and deployment configuration remain outstanding and untested.

## 14. Rollback

Set `JOBS_ENABLED=false` (instant; jobs stay in the table, nothing executes). To remove the schema (no data other than jobs is touched; verified in `tests/db/migrations-fresh.test.ts`): `DROP TABLE background_job_attempts; DROP TABLE background_jobs; DROP TYPE job_status;` and delete the `0012` row from `drizzle.__drizzle_migrations` if re-applying later.
