/**
 * The "internal appointment record" side of the booking order, and the
 * idempotency/reconciliation state that requires.
 *
 * IMPORTANT — this is an in-memory placeholder, not the real `appointments`
 * table in src/db/schema.ts. That table's `tenant_id`/`customer_id`/
 * `service_id` are NOT NULL foreign keys into rows that don't exist yet —
 * no CRM layer resolves "which customer/tenant/service row does this
 * phone number and service name map to" (that's Phase 2, explicitly out
 * of scope here, same as it was for createSimulatedReceptionistTools).
 * Building it now would mean inventing tenant/customer/service resolution
 * as an undocumented side effect of a calendar-integration task.
 *
 * What's real: the interface shape, the idempotency behavior, and the
 * reconciliation queue are exactly what a real Postgres-backed
 * implementation would need to satisfy — swapping this in-memory version
 * for one backed by the `appointments` table is a contained change once
 * that CRM layer exists; nothing above this file (the tools factory,
 * ReceptionistAgent, either AIProvider) would need to change.
 */

export interface InternalAppointmentRecord {
  idempotencyKey: string;
  googleEventId: string;
  name: string;
  phone: string;
  service: string;
  startDateTime: string;
  endDateTime: string;
  createdAt: string;
}

export interface InternalAppointmentStore {
  findByIdempotencyKey(key: string): Promise<InternalAppointmentRecord | undefined>;
  save(record: InternalAppointmentRecord): Promise<void>;
}

export function createInMemoryAppointmentStore(): InternalAppointmentStore & {
  all(): InternalAppointmentRecord[];
} {
  const records = new Map<string, InternalAppointmentRecord>();
  return {
    async findByIdempotencyKey(key) {
      return records.get(key);
    },
    async save(record) {
      records.set(record.idempotencyKey, record);
    },
    all() {
      return [...records.values()];
    },
  };
}

/**
 * Where a booking goes when the Google Calendar event was created
 * successfully but the internal record write failed. The customer is
 * never told this failed — the appointment genuinely exists on the
 * calendar — but this queue is what makes the gap recoverable: it has
 * everything needed to write the internal record later without touching
 * Google Calendar again (so a retry can never create a duplicate event).
 */
export interface ReconciliationEntry extends InternalAppointmentRecord {
  reason: string;
  queuedAt: string;
}

export interface ReconciliationQueue {
  enqueue(entry: ReconciliationEntry): Promise<void>;
  list(): Promise<ReconciliationEntry[]>;
}

export function createInMemoryReconciliationQueue(): ReconciliationQueue {
  const entries: ReconciliationEntry[] = [];
  return {
    async enqueue(entry) {
      entries.push(entry);
      console.error(
        "[reconciliation] internal appointment write failed after calendar success — queued",
        entry,
      );
    },
    async list() {
      return [...entries];
    },
  };
}
