# Staging Part 1 (database only) — executed 2026-10-09

Owner-approved target: host `dpg-db4h0evlk1mc7380om60-a.oregon-postgres.render.com`, database `bahaos_staging_db` (Render free plan, PostgreSQL 18.6, Oregon; the free database expires 2026-11-08). No secrets are recorded here. Executed from the owner's laptop; nothing was deployed; no paid AI calls, no WhatsApp traffic, no production access.

| Step | Result |
|---|---|
| Approved-identity guard (`scripts/staging/db-identity.ts`) | confirmed host + database (server-reported `current_database()` matched) |
| Empty check | 0 tables in `public` before migration |
| `npm run db:migrate` | applied 13 migrations, no errors |
| Structure | 22 tables, 82 indexes, 25 enums, 70 non-NOT-NULL constraints (+201 NOT NULL rows that PostgreSQL 18 lists in `pg_constraint`; 271 total) |
| Migration history | 13 rows; fingerprint `b008423228a63dd4c5386b14895d8c0b` equals the md5 computed from the committed `drizzle/*.sql` files (0008 = `66437feb…`, 0010 = `e176dcbb…`); journal order and timestamps match |
| Test clinic + admin | tenant `bahamas-dental-service` created; one admin login created (placeholder email `you@example.com`; password saved by the owner, never shared) |
| Backup + restore verification | `VERIFIED`: restored into a throwaway local PostgreSQL 18.6; full schema definitions identical; row counts and per-table content hashes identical. Dump kept: `~/bahaos-staging-backups/staging-20261009T131314.dump` |

## Incidents and corrections during execution (all closed)
1. **Credential exposure:** a malformed (double-pasted) URL made the guard's refusal message echo part of the connection string; the password appeared in the chat transcript. The owner **rotated the credential** before any further use. The guard now prints only values that look like plain host/database names (test added).
2. **PostgreSQL 18 differences in the comparison script:** NOT NULL constraints are now `pg_constraint` rows (counted separately); `pg_dump` comment/banner lines differ by build (definitions-only comparison); the content fingerprint depended on session time zone and sort collation (now forced to UTC and byte order). Each failed closed, was diagnosed, fixed and re-run; the final pass is the result above. The earlier failed runs left two older dump files (taken from the same state).
3. **Scratch server start** needed `LC_ALL=en_US.UTF-8` on macOS.

## Not covered by this evidence
Web service deploy, Meta webhook, WhatsApp delivery, AI behaviour on staging, the corrections/duplicate/takeover/jobs steps (S2–S12), and any production environment. The free database has no provider backups; the local dump above is the only copy.
