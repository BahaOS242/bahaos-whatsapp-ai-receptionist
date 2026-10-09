import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

/**
 * A FRESH install must be able to apply every migration in one run. Regression
 * guard: drizzle applies all pending migrations in ONE transaction, and
 * Postgres forbids using an enum value added earlier in that same transaction
 * (0008's backfill once referenced `retry_pending` as an enum literal).
 * Creates and drops a scratch database on the test server.
 * REQUIRES a real Postgres — run via `npm run test:db`.
 */
describe("fresh-install migrations (REQUIRES a real Postgres)", () => {
  it("applies the whole chain from an empty database", async () => {
    const base = new URL(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test");
    const name = `bahaos_fresh_${process.pid}_${Date.now()}`;
    const admin = new Pool({ connectionString: new URL("/postgres", base).toString() });
    await admin.query(`CREATE DATABASE ${name}`);
    const scratchUrl = new URL(`/${name}`, base).toString();
    const pool = new Pool({ connectionString: scratchUrl });
    try {
      await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), "drizzle") });
      const t = await pool.query(
        "select count(*)::int n from information_schema.tables where table_name in ('outbox_messages','staff_sessions','customer_memories')",
      );
      expect(t.rows[0].n).toBe(3);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  }, 60_000);
});
