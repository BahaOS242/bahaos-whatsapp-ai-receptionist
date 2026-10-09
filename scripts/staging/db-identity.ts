/**
 * Staging database identity guard. A staging step may only touch the ONE database the owner approved, named by
 * its host and database name (neither is a secret): STAGING_DB_HOST and STAGING_DB_NAME. Both are required and
 * must match DATABASE_URL exactly; there is no override. The CLI form also asks the server which database it is
 * really connected to.
 *
 * usage: STAGING_DB_HOST=... STAGING_DB_NAME=... DATABASE_URL=... npx tsx scripts/staging/db-identity.ts
 */
import "dotenv/config";
import { Pool } from "pg";

export interface DbIdentity { host: string; database: string }

export function parseDbIdentity(url: string): DbIdentity {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("DATABASE_URL is not a valid URL"); }
  return { host: u.hostname.toLowerCase(), database: decodeURIComponent(u.pathname.replace(/^\//, "")) };
}

/** Throws unless DATABASE_URL points at exactly the approved host and database name. Never prints credentials. */
export function assertApprovedStagingDb(url: string | undefined, env: NodeJS.ProcessEnv): DbIdentity {
  const approvedHost = env.STAGING_DB_HOST?.trim().toLowerCase();
  const approvedName = env.STAGING_DB_NAME?.trim();
  if (!approvedHost || !approvedName) {
    throw new Error("Refusing: STAGING_DB_HOST and STAGING_DB_NAME (the approved database identity) must both be set.");
  }
  if (!url) throw new Error("Refusing: DATABASE_URL is not set.");
  const actual = parseDbIdentity(url);
  if (actual.host !== approvedHost || actual.database !== approvedName) {
    throw new Error(
      `Refusing: DATABASE_URL points at ${actual.host}/${actual.database}, not the approved ${approvedHost}/${approvedName}.`,
    );
  }
  return actual;
}

export async function assertConnectedDatabase(url: string, env: NodeJS.ProcessEnv): Promise<DbIdentity> {
  const identity = assertApprovedStagingDb(url, env);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query("select current_database() as db");
    if (rows[0].db !== identity.database) throw new Error(`Refusing: server reports database "${rows[0].db}".`);
  } finally {
    await pool.end();
  }
  return identity;
}

if (process.argv[1]?.endsWith("db-identity.ts")) {
  assertConnectedDatabase(process.env.DATABASE_URL ?? "", process.env)
    .then((i) => console.log(`approved staging database confirmed: ${i.host}/${i.database}`))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
}
