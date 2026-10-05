import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { getEnv } from "../config/env";
import * as schema from "./schema";

/**
 * Shared handle type for every db/*.ts function — deliberately the BARE
 * `NodePgDatabase<typeof schema>`, not `ReturnType<typeof getDb>` (which
 * carries an extra `$client: Pool` intersection member that only the
 * top-level pool-backed handle actually has). A `db.transaction(async
 * (tx) => ...)` callback's `tx` parameter is a NodePgTransaction, which
 * satisfies this bare type (same inherited PgDatabase query-builder
 * surface) but NOT the `$client`-bearing one — widening this is what
 * lets every existing db/*.ts function (resolveTenant, resolveCustomer,
 * findOrCreateActiveConversation, recordMessage, ...) be called with
 * EITHER a plain db handle OR a transaction handle, with no changes to
 * their own bodies. This is what makes the WhatsApp webhook's
 * per-customer advisory-lock transaction (see
 * src/whatsapp/webhook-processing.ts) possible without duplicating any
 * of this file's logic for a "transactional variant."
 */
export type Db = NodePgDatabase<typeof schema>;

/**
 * Lazy singleton: the pool isn't opened until something actually queries
 * the database, so importing this module (e.g. transitively, in tests)
 * never attempts a network connection on its own.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv().DATABASE_URL });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
