import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema";

/**
 * Test-only DB wiring, deliberately independent of src/db/client.ts's
 * getPool()/getEnv() — that path validates the FULL application env
 * schema (WhatsApp, Anthropic/OpenRouter keys, etc.) just to open a
 * connection, and would point at whatever DATABASE_URL the developer's
 * .env happens to have configured for the app itself. These tests need
 * their own explicit, disposable database — never the app's configured
 * one — so they connect directly via TEST_DATABASE_URL, defaulting to a
 * local database created specifically for this test suite (see the
 * README note in this file's sibling test for exact setup commands).
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test";

export function createTestDb() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/** Deletes all rows from the tables these tests touch, in FK-safe order.
 * Runs before each test for isolation — this is a disposable test
 * database, so a blunt truncate is fine (never run against anything
 * else). */
export async function resetTestData(db: ReturnType<typeof createTestDb>["db"]): Promise<void> {
  // Outbox rows reference messages/conversations/customers.
  await db.delete(schema.outboxMessages);
  // Knowledge-engine tables (they reference tenants/conversations).
  await db.delete(schema.knowledgeRetrievalLogs);
  await db.delete(schema.knowledgeChunks);
  await db.delete(schema.knowledgeDocuments);
  await db.delete(schema.knowledgeSources);
  await db.delete(schema.knowledgeConflicts);
  await db.delete(schema.customerMemories);
  await db.delete(schema.auditEvents);
  await db.delete(schema.appointments);
  await db.delete(schema.leads);
  await db.delete(schema.languageObservations);
  await db.delete(schema.handoffs);
  await db.delete(schema.messages);
  await db.delete(schema.conversations);
  await db.delete(schema.services);
  await db.delete(schema.staffSessions);
  await db.delete(schema.staffUsers);
  await db.delete(schema.customers);
  await db.delete(schema.tenants);
}

export interface Fixtures {
  tenantId: string;
  serviceId: string;
  /** A second, independent service — only needed by tests that don't
   * care about service identity but want a valid FK. */
  staffAId: string;
  staffBId: string;
  customerAId: string;
  customerBId: string;
}

/** Minimal rows to satisfy appointments' NOT NULL foreign keys — one
 * tenant, one service, two staff users (for the "different providers"
 * case), two customers (for the "two different customers" case). Not a
 * general-purpose fixture factory; just what this test file's scenarios
 * need. */
export async function seedFixtures(db: ReturnType<typeof createTestDb>["db"]): Promise<Fixtures> {
  const [tenant] = await db
    .insert(schema.tenants)
    .values({ slug: "concurrency-test", name: "Concurrency Test Tenant", timezone: "UTC" })
    .returning();

  const [service] = await db
    .insert(schema.services)
    .values({ tenantId: tenant.id, name: "Routine cleaning", durationMinutes: 30 })
    .returning();

  const [staffA] = await db
    .insert(schema.staffUsers)
    .values({ tenantId: tenant.id, email: "dentist-a@example.test", name: "Dr. A" })
    .returning();
  const [staffB] = await db
    .insert(schema.staffUsers)
    .values({ tenantId: tenant.id, email: "dentist-b@example.test", name: "Dr. B" })
    .returning();

  const [customerA] = await db
    .insert(schema.customers)
    .values({ tenantId: tenant.id, whatsappId: "15550000001" })
    .returning();
  const [customerB] = await db
    .insert(schema.customers)
    .values({ tenantId: tenant.id, whatsappId: "15550000002" })
    .returning();

  return {
    tenantId: tenant.id,
    serviceId: service.id,
    staffAId: staffA.id,
    staffBId: staffB.id,
    customerAId: customerA.id,
    customerBId: customerB.id,
  };
}
