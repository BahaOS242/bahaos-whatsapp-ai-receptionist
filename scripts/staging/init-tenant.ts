/**
 * Creates (or finds) the single test clinic's tenant row so a staff login can be created before any WhatsApp
 * message arrives. Idempotent: the same code path (resolveTenant) the webhook uses on its first message.
 *
 * usage: DATABASE_URL=... npx tsx scripts/staging/init-tenant.ts
 * Refuses to run unless the database name or host contains "staging" (or STAGING_INIT_CONFIRM=yes), so it can
 * never be pointed at a production or personal database by accident.
 */
import "dotenv/config";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { closeDb, getDb } from "../../src/db/client";
import { resolveTenant } from "../../src/db/domain-resolution";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/staging/i.test(url) && process.env.STAGING_INIT_CONFIRM !== "yes") {
    console.error('Refusing: DATABASE_URL does not contain "staging". Set STAGING_INIT_CONFIRM=yes to override.');
    process.exit(2);
  }
  const db = getDb();
  const id = await resolveTenant(db, BAHAMAS_DENTAL_SERVICE);
  console.log(`tenant ready: ${id}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
