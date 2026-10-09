/**
 * Creates (or finds) the single test clinic's tenant row so a staff login can be created before any WhatsApp
 * message arrives. Idempotent: the same code path (resolveTenant) the webhook uses on its first message.
 *
 * usage: STAGING_DB_HOST=... STAGING_DB_NAME=... DATABASE_URL=... npx tsx scripts/staging/init-tenant.ts
 * Refuses unless DATABASE_URL matches the owner-approved staging host + database name (no override).
 */
import "dotenv/config";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { closeDb, getDb } from "../../src/db/client";
import { resolveTenant } from "../../src/db/domain-resolution";
import { assertConnectedDatabase } from "./db-identity";

async function main() {
  await assertConnectedDatabase(process.env.DATABASE_URL ?? "", process.env);
  const db = getDb();
  const id = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
  console.log(`tenant ready: ${id}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
