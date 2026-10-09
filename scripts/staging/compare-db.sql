-- READ-ONLY structural + row-count fingerprint. Run against BOTH the source and the restored copy; the outputs must be identical.
-- usage: psql "$URL" -X -A -t -f scripts/staging/compare-db.sql
select 'tables', count(*) from information_schema.tables where table_schema in ('public') and table_type = 'BASE TABLE';
select 'indexes', count(*) from pg_indexes where schemaname = 'public';
select 'constraints', count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public';
select 'enums', count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e' and n.nspname = 'public';
select 'migration_rows', count(*) from drizzle.__drizzle_migrations;
select 'migration_hashes', md5(string_agg(hash, ',' order by created_at)) from drizzle.__drizzle_migrations;
select 'rows:' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;
