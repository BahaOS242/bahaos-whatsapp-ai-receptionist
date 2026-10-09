/**
 * Operator CLI for background jobs (tenant-scoped; never prints payloads in lists).
 *   npm run jobs -- list <tenant-slug> [pending|scheduled|running|retrying|failed|completed|cancelled]
 *   npm run jobs -- show <tenant-slug> <job-id>
 *   npm run jobs -- cancel <tenant-slug> <job-id>
 *   npm run jobs -- requeue <tenant-slug> <job-id>
 *   npm run jobs -- enqueue-memory-sweep <tenant-slug>      (idempotent per UTC day)
 */
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { tenants } from "../src/db/schema";
import { cancelJob, getJob, jobCounts, listJobs, requeueJob, type JobView } from "../src/jobs/admin";
import { createDefaultJobRegistry } from "../src/jobs/default-registry";
import { enqueueJob } from "../src/jobs/enqueue";
import { MEMORY_EXPIRE_SWEEP } from "../src/jobs/handlers/memory-expire-sweep";

async function main() {
  const [cmd, slug, arg] = process.argv.slice(2);
  if (!cmd || !slug) { console.error("usage: npm run jobs -- <list|show|cancel|requeue|enqueue-memory-sweep> <tenant-slug> [arg]"); process.exit(2); }
  const db = getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug.toLowerCase()) });
  if (!tenant) { console.error(`no tenant "${slug}"`); process.exit(1); }
  if (cmd === "list") {
    console.log(JSON.stringify(await jobCounts(db, tenant.id)));
    console.table(await listJobs(db, tenant.id, { view: arg as JobView | undefined }));
  } else if (cmd === "show" && arg) console.dir(await getJob(db, tenant.id, arg), { depth: 4 });
  else if (cmd === "cancel" && arg) console.log(await cancelJob(db, tenant.id, arg));
  else if (cmd === "requeue" && arg) console.log(await requeueJob(db, tenant.id, arg));
  else if (cmd === "enqueue-memory-sweep") {
    const day = new Date().toISOString().slice(0, 10);
    console.log(await enqueueJob(db, createDefaultJobRegistry(), { tenantId: tenant.id, type: MEMORY_EXPIRE_SWEEP, payload: {}, idempotencyKey: `memory.expire_sweep:${day}` }));
  } else { console.error("unknown command or missing argument"); process.exit(2); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(closeDb);
