/**
 * Create a staff user for the inbox.
 *   STAFF_PASSWORD=... npx tsx scripts/staff.ts <tenant-slug> <email> <name> [admin|staff]
 * The password is read from STAFF_PASSWORD (never argv, which leaks into
 * process listings and shell history). If unset, a strong one is generated
 * and printed ONCE — it is not stored anywhere in plaintext.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { tenants } from "../src/db/schema";
import { createStaffUser } from "../src/inbox/auth";

async function main() {
  const [slug, email, name, roleArg = "staff"] = process.argv.slice(2);
  if (!slug || !email || !name || !["admin", "staff"].includes(roleArg)) {
    console.error("usage: STAFF_PASSWORD=... tsx scripts/staff.ts <tenant-slug> <email> <name> [admin|staff]");
    process.exit(2);
  }
  const db = getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug.toLowerCase()) });
  if (!tenant) {
    console.error(`no tenant with slug "${slug}"`);
    process.exit(1);
  }
  const generated = !process.env.STAFF_PASSWORD;
  const password = process.env.STAFF_PASSWORD ?? randomBytes(15).toString("base64url");
  await createStaffUser(db, { tenantId: tenant.id, email, name, role: roleArg as "admin" | "staff", password });
  console.log(`Created ${roleArg} ${email} for tenant ${tenant.slug}.`);
  if (generated) console.log(`Generated password (shown once): ${password}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
