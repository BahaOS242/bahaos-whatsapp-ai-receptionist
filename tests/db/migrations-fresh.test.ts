import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
        "select count(*)::int n from information_schema.tables where table_name in ('outbox_messages','staff_sessions','customer_memories','background_jobs','background_job_attempts')",
      );
      expect(t.rows[0].n).toBe(5);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  }, 60_000);

  it("upgrades a PHASE 4 database (0000-0011 + data) to 0012 without touching existing data; constraints/indexes correct; manual rollback is clean", async () => {
    const base = new URL(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test");
    const name = `bahaos_upg_${process.pid}_${Date.now()}`;
    const admin = new Pool({ connectionString: new URL("/postgres", base).toString() });
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ connectionString: new URL(`/${name}`, base).toString() });
    const phase4 = mkdtempSync(join(tmpdir(), "phase4-migrations-"));
    try {
      // a migrations folder as it was at Phase 4: everything except 0012 and later
      cpSync(join(process.cwd(), "drizzle"), phase4, { recursive: true });
      const journalPath = join(phase4, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: Array<{ tag: string }> };
      journal.entries = journal.entries.filter((e) => !e.tag.startsWith("0012") && !e.tag.startsWith("0013"));
      writeFileSync(journalPath, JSON.stringify(journal));
      rmSync(join(phase4, "0012_background_jobs.sql"));
      rmSync(join(phase4, "0013_delivery_receipts.sql")); // a Phase 4 folder has neither 0012 nor anything after it
      await migrate(drizzle(pool), { migrationsFolder: phase4 });
      expect((await pool.query("select to_regclass('public.background_jobs') as t")).rows[0].t).toBeNull();

      // Phase 4 data across every domain the new migration must not disturb
      const T = "11111111-1111-4111-8111-111111111111", C = "c1111111-1111-4111-8111-111111111111", V = "d1111111-1111-4111-8111-111111111111";
      await pool.query(`insert into tenants(id,slug,name,timezone) values ('${T}','t1','T1','UTC')`);
      await pool.query(`insert into customers(id,tenant_id,whatsapp_id) values ('${C}','${T}','+12425550001')`);
      await pool.query(`insert into conversations(id,tenant_id,customer_id,status) values ('${V}','${T}','${C}','human_pending')`);
      await pool.query(`insert into messages(id,tenant_id,conversation_id,direction,sender_type,content) values (gen_random_uuid(),'${T}','${V}','inbound','customer','hello')`);
      await pool.query(`insert into handoffs(id,tenant_id,conversation_id,reason) values (gen_random_uuid(),'${T}','${V}','asked for a person')`);
      await pool.query(`insert into customer_memories(id,tenant_id,customer_id,kind,slot,value,source) values (gen_random_uuid(),'${T}','${C}','preferred_name','name','Alicia','customer_stated')`);
      const snap = async () => JSON.stringify((await Promise.all(["tenants", "customers", "conversations", "messages", "handoffs", "customer_memories", "outbox_messages", "appointments"].map((t) => pool.query(`select * from ${t} order by 1`)))).map((r) => r.rows));
      const before = await snap();

      await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), "drizzle") });
      expect(await snap()).toBe(before); // nothing existing was altered

      const idx = (await pool.query("select indexname from pg_indexes where tablename in ('background_jobs','background_job_attempts') order by 1")).rows.map((r) => r.indexname);
      expect(idx).toEqual(expect.arrayContaining(["background_jobs_due_idx", "background_jobs_lease_idx", "background_jobs_tenant_idempotency_key", "background_jobs_tenant_status_idx", "background_job_attempts_job_idx"]));
      const due = (await pool.query("select indexdef from pg_indexes where indexname = 'background_jobs_due_idx'")).rows[0].indexdef as string;
      expect(due).toMatch(/WHERE .*status.* = 'pending'/); // partial: only waiting rows are indexed
      const checks = (await pool.query("select conname from pg_constraint where conrelid = 'background_jobs'::regclass and contype = 'c' order by 1")).rows.map((r) => r.conname);
      expect(checks).toEqual(["background_jobs_attempts_ck", "background_jobs_running_has_lease_ck"]);
      const fks = (await pool.query("select conname from pg_constraint where conrelid in ('background_jobs'::regclass, 'background_job_attempts'::regclass) and contype = 'f' order by 1")).rows.map((r) => r.conname);
      expect(fks).toEqual(["background_job_attempts_job_id_background_jobs_id_fk", "background_job_attempts_tenant_id_tenants_id_fk", "background_jobs_tenant_id_tenants_id_fk"]);
      // the tenant FK is real
      await expect(pool.query(`insert into background_jobs(id,tenant_id,job_type,payload,payload_hash,idempotency_key) values (gen_random_uuid(),'99999999-9999-4999-8999-999999999999','x.y','{}','h','k')`)).rejects.toThrow();
      await pool.query(`insert into background_jobs(id,tenant_id,job_type,payload,payload_hash,idempotency_key) values (gen_random_uuid(),'${T}','x.y','{}','h','k')`);
      await expect(pool.query(`insert into background_jobs(id,tenant_id,job_type,payload,payload_hash,idempotency_key) values (gen_random_uuid(),'${T}','x.y','{}','h','k')`)).rejects.toThrow(); // unique (tenant, key)

      // documented manual rollback (BACKGROUND_JOBS.md): drop the two tables and the enum; Phase 4 data untouched
      await pool.query("drop table background_job_attempts; drop table background_jobs; drop type job_status;");
      expect(await snap()).toBe(before);
    } finally {
      rmSync(phase4, { recursive: true, force: true });
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  }, 120_000);

  it("0013 (delivery receipts) is additive: upgrades a 0012 database keeping every outbox row and value; new columns NULL; ledger constraints real; manual rollback is clean", async () => {
    const base = new URL(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/bahaos_concurrency_test");
    const name = `bahaos_upg13_${process.pid}_${Date.now()}`;
    const admin = new Pool({ connectionString: new URL("/postgres", base).toString() });
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ connectionString: new URL(`/${name}`, base).toString() });
    const upTo12 = mkdtempSync(join(tmpdir(), "to12-migrations-"));
    try {
      cpSync(join(process.cwd(), "drizzle"), upTo12, { recursive: true });
      const journalPath = join(upTo12, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: Array<{ tag: string }> };
      journal.entries = journal.entries.filter((e) => !e.tag.startsWith("0013"));
      writeFileSync(journalPath, JSON.stringify(journal));
      rmSync(join(upTo12, "0013_delivery_receipts.sql"));
      await migrate(drizzle(pool), { migrationsFolder: upTo12 });
      expect((await pool.query("select to_regclass('public.outbox_delivery_receipts') as t")).rows[0].t).toBeNull();

      const T = "11111111-1111-4111-8111-111111111111", C = "c1111111-1111-4111-8111-111111111111", V = "d1111111-1111-4111-8111-111111111111", M = "e1111111-1111-4111-8111-111111111111";
      await pool.query(`insert into tenants(id,slug,name,timezone) values ('${T}','t1','T1','UTC')`);
      await pool.query(`insert into customers(id,tenant_id,whatsapp_id) values ('${C}','${T}','+12425550001')`);
      await pool.query(`insert into conversations(id,tenant_id,customer_id,status) values ('${V}','${T}','${C}','ai_active')`);
      await pool.query(`insert into messages(id,tenant_id,conversation_id,direction,sender_type,content) values ('${M}','${T}','${V}','outbound','ai','hello')`);
      await pool.query(`insert into outbox_messages(id,tenant_id,conversation_id,customer_id,message_id,recipient,payload,status,idempotency_key,provider_message_id,sent_at) values (gen_random_uuid(),'${T}','${V}','${C}','${M}','+12425550001','{"body":"hello"}','sent','k1','wamid.OLD', now())`);
      const cols = "id, tenant_id, status, provider_message_id, idempotency_key, payload, sent_at";
      const before = JSON.stringify((await pool.query(`select ${cols} from outbox_messages order by 1`)).rows);

      await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), "drizzle") });
      expect(JSON.stringify((await pool.query(`select ${cols} from outbox_messages order by 1`)).rows)).toBe(before);
      const added = (await pool.query("select delivery_status, delivery_updated_at, delivered_at, delivery_error_code, delivery_error_title from outbox_messages")).rows[0];
      expect(Object.values(added).every((v) => v === null)).toBe(true);

      // ledger: tenant FK is real, and (tenant, id, status, event time) is unique
      const ins = (t: string) => pool.query(`insert into outbox_delivery_receipts(id,tenant_id,provider_message_id,status,event_at) values (gen_random_uuid(),'${t}','wamid.OLD','delivered','2026-01-01T00:00:00Z')`);
      await expect(ins("99999999-9999-4999-8999-999999999999")).rejects.toThrow();
      await ins(T);
      await expect(ins(T)).rejects.toThrow();
      const idx = (await pool.query("select indexname from pg_indexes where tablename in ('outbox_delivery_receipts','outbox_messages') order by 1")).rows.map((r) => r.indexname);
      expect(idx).toEqual(expect.arrayContaining(["outbox_delivery_receipts_event_key", "outbox_delivery_receipts_message_idx", "outbox_messages_tenant_provider_message_idx"]));

      // documented manual rollback: drop the ledger and the five columns; existing outbox data untouched
      await pool.query(
        "drop table outbox_delivery_receipts; alter table outbox_messages drop column delivery_status, drop column delivery_updated_at, drop column delivered_at, drop column delivery_error_code, drop column delivery_error_title; drop index if exists outbox_messages_tenant_provider_message_idx;",
      );
      expect(JSON.stringify((await pool.query(`select ${cols} from outbox_messages order by 1`)).rows)).toBe(before);
    } finally {
      rmSync(upTo12, { recursive: true, force: true });
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  }, 120_000);
});
