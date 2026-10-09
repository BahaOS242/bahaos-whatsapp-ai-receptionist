import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { auditEvents } from "../db/schema";
import { validateCandidate } from "./policy";
import {
  MAX_ACTIVE_MEMORIES_PER_CUSTOMER,
  type MemoryCandidate,
  type MemoryKind,
  type MemorySource,
  type MemoryStatus,
  type RejectReason,
  type StoredMemory,
} from "./types";

/**
 * Persistence for customer memory. EVERY statement is scoped by
 * (tenant_id, customer_id) — there is no function that takes a bare memory
 * id without also taking the tenant. Callers pass a handle that is already
 * inside a transaction/savepoint when they need atomicity with other work.
 */

export interface MemoryScope {
  tenantId: string;
  customerId: string;
}

export type ApplyOutcome =
  | { outcome: "created"; id: string; supersededId?: string }
  | { outcome: "unchanged"; id: string }
  | { outcome: "rejected"; reason: RejectReason };

interface Row {
  id: string; kind: MemoryKind; slot: string; value: string; display: string | null; status: MemoryStatus;
  source: MemorySource; created_at: Date; updated_at: Date; expires_at: Date | null;
}

const toStored = (r: Row): StoredMemory => ({
  id: r.id, kind: r.kind, slot: r.slot, value: r.value, display: r.display, status: r.status,
  source: r.source, createdAt: r.created_at, updatedAt: r.updated_at, expiresAt: r.expires_at,
});

/** Retires expired rows so their slots are free again. Scrubs content. */
export async function sweepExpired(db: Db, scope: MemoryScope, now: Date): Promise<number> {
  const r = await db.execute(sql`
    UPDATE customer_memories
       SET status = 'deleted', status_reason = 'expired', status_changed_at = ${now.toISOString()}::timestamptz,
           value = '', display = NULL, updated_at = ${now.toISOString()}::timestamptz
     WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid
       AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= ${now.toISOString()}::timestamptz
 RETURNING id`);
  return r.rows.length;
}

export interface ApplyContext {
  conversationId?: string;
  sourceMessageId?: string;
  now: Date;
}

/** Validates, then stores one candidate with supersession. Idempotent for an unchanged value. */
export async function applyCandidate(db: Db, scope: MemoryScope, candidate: MemoryCandidate, ctx: ApplyContext): Promise<ApplyOutcome> {
  const verdict = validateCandidate(candidate);
  if (!verdict.ok) return { outcome: "rejected", reason: verdict.reason };
  const c = verdict.candidate;
  const nowIso = ctx.now.toISOString();
  const expires = c.ttlSeconds ? new Date(ctx.now.getTime() + c.ttlSeconds * 1000).toISOString() : null;

  // The customer must belong to the tenant. (customer_id alone is a plain FK; this keeps a
  // buggy caller from ever creating a cross-tenant row.)
  const owns = await db.execute(sql`SELECT 1 FROM customers WHERE id = ${scope.customerId}::uuid AND tenant_id = ${scope.tenantId}::uuid`);
  if (owns.rows.length === 0) return { outcome: "rejected", reason: "malformed" };

  await sweepExpired(db, scope, ctx.now);

  // Stale work must not resurrect what a person or a newer statement has since removed:
  // if THIS slot was deleted/invalidated/superseded AFTER the source message arrived, the
  // message predates that decision. (Expiry tombstones are excluded: they are lifecycle, not decisions.)
  if (ctx.sourceMessageId) {
    const stale = await db.execute(sql`
      SELECT 1 FROM customer_memories t
       WHERE t.tenant_id = ${scope.tenantId}::uuid AND t.customer_id = ${scope.customerId}::uuid
         AND t.kind = ${c.kind}::memory_kind AND t.slot = ${c.slot}
         AND t.status IN ('deleted', 'invalidated', 'superseded') AND COALESCE(t.status_reason, '') <> 'expired'
         AND t.status_changed_at > (SELECT m.created_at FROM messages m WHERE m.id = ${ctx.sourceMessageId}::uuid AND m.tenant_id = ${scope.tenantId}::uuid)
       LIMIT 1`);
    if (stale.rows.length > 0) return { outcome: "rejected", reason: "stale_after_deletion" };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await db.execute(sql`
      SELECT id, value FROM customer_memories
       WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid
         AND kind = ${c.kind}::memory_kind AND slot = ${c.slot} AND status = 'active'
       FOR UPDATE`);
    const current = existing.rows[0] as { id: string; value: string } | undefined;

    if (current && current.value === c.value) {
      if (expires) {
        await db.execute(sql`UPDATE customer_memories SET expires_at = ${expires}::timestamptz, updated_at = ${nowIso}::timestamptz WHERE id = ${current.id}::uuid AND tenant_id = ${scope.tenantId}::uuid`);
      }
      return { outcome: "unchanged", id: current.id };
    }

    if (!current) {
      const count = await db.execute(sql`
        SELECT count(*)::int AS n FROM customer_memories
         WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid AND status = 'active'`);
      if ((count.rows[0] as { n: number }).n >= MAX_ACTIVE_MEMORIES_PER_CUSTOMER) return { outcome: "rejected", reason: "limit" };
    } else {
      await db.execute(sql`
        UPDATE customer_memories
           SET status = 'superseded', status_reason = 'corrected', status_changed_at = ${nowIso}::timestamptz,
               value = '', display = NULL, updated_at = ${nowIso}::timestamptz
         WHERE id = ${current.id}::uuid AND tenant_id = ${scope.tenantId}::uuid`);
    }

    const inserted = await db.execute(sql`
      INSERT INTO customer_memories
        (id, tenant_id, customer_id, kind, slot, value, display, status, source, provenance,
         source_message_id, conversation_id, expires_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${scope.tenantId}::uuid, ${scope.customerId}::uuid, ${c.kind}::memory_kind, ${c.slot},
              ${c.value}, ${c.display ?? c.value}, 'active', ${c.source}::memory_source, 'explicit',
              ${ctx.sourceMessageId ?? null}::uuid, ${ctx.conversationId ?? null}::uuid, ${expires}::timestamptz,
              ${nowIso}::timestamptz, ${nowIso}::timestamptz)
      ON CONFLICT (tenant_id, customer_id, kind, slot) WHERE status = 'active' DO NOTHING
      RETURNING id`);
    const created = inserted.rows[0] as { id: string } | undefined;
    if (created) {
      if (current) {
        await db.execute(sql`UPDATE customer_memories SET superseded_by_id = ${created.id}::uuid WHERE id = ${current.id}::uuid AND tenant_id = ${scope.tenantId}::uuid`);
        await audit(db, scope.tenantId, "memory.corrected", created.id, { kind: c.kind, slot: c.slot, previousId: current.id });
      }
      return { outcome: "created", id: created.id, supersededId: current?.id };
    }
    // Lost a race with another writer for the same slot: loop and re-read.
  }
  return { outcome: "unchanged", id: "" };
}

export async function listMemories(
  db: Db, scope: MemoryScope, opts: { includeInactive?: boolean; now?: Date } = {},
): Promise<StoredMemory[]> {
  const now = (opts.now ?? new Date()).toISOString();
  const r = await db.execute(sql`
    SELECT id, kind, slot, value, display, status, source, created_at, updated_at, expires_at
      FROM customer_memories
     WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid
       ${opts.includeInactive ? sql`` : sql`AND status = 'active' AND (expires_at IS NULL OR expires_at > ${now}::timestamptz)`}
     ORDER BY kind, slot, created_at DESC, id`);
  return (r.rows as unknown as Row[]).map(toStored);
}

async function audit(db: Db, tenantId: string, event: string, memoryId: string, metadata: Record<string, unknown>, actorId?: string) {
  // ids/kinds only — never the remembered value.
  await db.insert(auditEvents).values({
    tenantId, actorType: actorId ? "staff" : "system", actorId: actorId ?? null,
    eventType: event, entityType: "customer_memory", entityId: memoryId, metadata,
  });
}

export interface AdminActor { staffUserId?: string }

async function retire(
  db: Db, scope: MemoryScope, memoryId: string, to: "invalidated" | "deleted", reason: string, actor: AdminActor, now: Date,
): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE customer_memories
       SET status = ${to}::memory_status, status_reason = ${reason}, status_changed_at = ${now.toISOString()}::timestamptz,
           value = '', display = NULL, updated_at = ${now.toISOString()}::timestamptz
     WHERE id = ${memoryId}::uuid AND tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid AND status = 'active'
 RETURNING kind, slot`);
  const row = r.rows[0] as { kind: string; slot: string } | undefined;
  if (!row) return false; // not found, other tenant/customer, or already inactive — indistinguishable
  await audit(db, scope.tenantId, to === "invalidated" ? "memory.invalidated" : "memory.deleted", memoryId, { kind: row.kind, slot: row.slot, reason }, actor.staffUserId);
  return true;
}

export const invalidateMemory = (db: Db, scope: MemoryScope, memoryId: string, actor: AdminActor = {}, now = new Date()) =>
  retire(db, scope, memoryId, "invalidated", "invalidated_by_operator", actor, now);

export const deleteMemory = (db: Db, scope: MemoryScope, memoryId: string, actor: AdminActor = {}, now = new Date()) =>
  retire(db, scope, memoryId, "deleted", "deleted_by_operator", actor, now);

/** Replaces the value of an ACTIVE memory (operator correction). The new value is validated like any candidate. */
export async function correctMemory(
  db: Db, scope: MemoryScope, memoryId: string, newValue: string, actor: AdminActor = {}, now = new Date(),
): Promise<ApplyOutcome | { outcome: "not_found" }> {
  const r = await db.execute(sql`
    SELECT kind, slot FROM customer_memories
     WHERE id = ${memoryId}::uuid AND tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid AND status = 'active'`);
  const row = r.rows[0] as { kind: MemoryKind; slot: string } | undefined;
  if (!row) return { outcome: "not_found" };
  const out = await applyCandidate(db, scope, { kind: row.kind, slot: row.slot, value: newValue, source: "staff_entered", provenance: "explicit" }, { now });
  if (out.outcome === "created" && actor.staffUserId) await audit(db, scope.tenantId, "memory.corrected_by_staff", out.id, { kind: row.kind, slot: row.slot }, actor.staffUserId);
  return out;
}

/** Deletes every ACTIVE memory of one customer (tombstones remain). */
export async function deleteAllForCustomer(db: Db, scope: MemoryScope, actor: AdminActor = {}, now = new Date()): Promise<number> {
  const r = await db.execute(sql`
    UPDATE customer_memories
       SET status = 'deleted', status_reason = 'customer_memory_cleared', status_changed_at = ${now.toISOString()}::timestamptz,
           value = '', display = NULL, updated_at = ${now.toISOString()}::timestamptz
     WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid AND status = 'active'
 RETURNING id`);
  if (r.rows.length > 0) {
    await db.insert(auditEvents).values({
      tenantId: scope.tenantId, actorType: actor.staffUserId ? "staff" : "system", actorId: actor.staffUserId ?? null,
      eventType: "memory.cleared", entityType: "customer", entityId: scope.customerId, metadata: { count: r.rows.length },
    });
  }
  return r.rows.length;
}

/** Hard-deletes ALL memory rows (including tombstones) of one customer. Transcripts, appointments, audit rows and backups are NOT touched. */
export async function purgeCustomerMemories(db: Db, scope: MemoryScope, actor: AdminActor = {}): Promise<number> {
  const r = await db.execute(sql`
    DELETE FROM customer_memories WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid RETURNING id`);
  await db.insert(auditEvents).values({
    tenantId: scope.tenantId, actorType: actor.staffUserId ? "staff" : "system", actorId: actor.staffUserId ?? null,
    eventType: "memory.purged", entityType: "customer", entityId: scope.customerId, metadata: { count: r.rows.length },
  });
  return r.rows.length;
}

/** Deletes the customer's ACTIVE memories of the given kinds (tombstones remain). Used for conversational privacy requests. */
export async function deleteByKinds(db: Db, scope: MemoryScope, kinds: MemoryKind[] | "all", now: Date): Promise<number> {
  const r = await db.execute(sql`
    UPDATE customer_memories
       SET status = 'deleted', status_reason = 'customer_requested', status_changed_at = ${now.toISOString()}::timestamptz,
           value = '', display = NULL, updated_at = ${now.toISOString()}::timestamptz
     WHERE tenant_id = ${scope.tenantId}::uuid AND customer_id = ${scope.customerId}::uuid AND status = 'active'
       ${kinds === "all" ? sql`` : sql`AND kind::text IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})`}
 RETURNING id`);
  if (r.rows.length > 0) {
    await db.insert(auditEvents).values({
      tenantId: scope.tenantId, actorType: "system", actorId: null, eventType: "memory.deleted_on_customer_request",
      entityType: "customer", entityId: scope.customerId, metadata: { count: r.rows.length, scope: kinds === "all" ? "all" : kinds },
    });
  }
  return r.rows.length;
}

/**
 * Retires up to `limit` expired ACTIVE memories of ONE tenant (any customer). Retrieval already ignores
 * expired rows, so this changes nothing user-visible; it frees slots and scrubs content. Idempotent.
 */
export async function sweepExpiredForTenant(db: Db, tenantId: string, now: Date, limit = 500): Promise<number> {
  const r = await db.execute(sql`
    UPDATE customer_memories
       SET status = 'deleted', status_reason = 'expired', status_changed_at = ${now.toISOString()}::timestamptz,
           value = '', display = NULL, updated_at = ${now.toISOString()}::timestamptz
     WHERE id IN (SELECT id FROM customer_memories
                   WHERE tenant_id = ${tenantId}::uuid AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= ${now.toISOString()}::timestamptz
                   ORDER BY expires_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
       AND tenant_id = ${tenantId}::uuid
 RETURNING id`);
  return r.rows.length;
}
