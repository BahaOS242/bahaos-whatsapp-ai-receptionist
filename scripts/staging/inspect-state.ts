/**
 * READ-ONLY snapshot of staging conversation state, for checking a test run. SELECT only.
 * Prints counts, the last few messages of the test customer(s), appointments (service, local start time, status,
 * customer display name and WhatsApp id) and outbox delivery outcomes (status and error code only).
 *
 * usage: STAGING_DB_HOST=... STAGING_DB_NAME=... DATABASE_URL=... npx tsx scripts/staging/inspect-state.ts [phone-digits]
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../../src/db/client";
import { assertConnectedDatabase } from "./db-identity";

async function main() {
  await assertConnectedDatabase(process.env.DATABASE_URL ?? "", process.env);
  const db = getDb();
  const phone = process.argv[2];

  const counts = await db.execute(sql`
    select 'messages' k, count(*) from messages union all select 'customers', count(*) from customers
    union all select 'conversations', count(*) from conversations union all select 'appointments', count(*) from appointments
    union all select 'outbox:' || status::text, count(*) from outbox_messages group by status order by 1`);
  console.log("counts:", JSON.stringify(counts.rows));

  const msgs = await db.execute(sql`
    select m.direction, m.sender_type, to_char(m.created_at at time zone 'America/Nassau','HH24:MI:SS') as at, left(m.content, 160) as content
    from messages m join conversations c on c.id = m.conversation_id join customers cu on cu.id = c.customer_id
    where ${phone ?? ""} = '' or cu.whatsapp_id like '%' || ${phone ?? ""}
    order by m.created_at desc limit 14`);
  console.log("recent messages (newest first):");
  for (const r of msgs.rows) console.log(`  ${r.at} ${r.direction}/${r.sender_type}: ${r.content}`);

  const states = await db.execute(sql`
    select cu.whatsapp_id, c.booking_state
    from conversations c join customers cu on cu.id = c.customer_id
    where ${phone ?? ""} = '' or cu.whatsapp_id like '%' || ${phone ?? ""}
    order by c.updated_at desc limit 3`);
  console.log("conversation state (test data):", JSON.stringify(states.rows));

  const appts = await db.execute(sql`
    select a.status::text, to_char(a.starts_at at time zone 'America/Nassau','YYYY-MM-DD HH24:MI') as starts_local,
           s.name as service, cu.display_name as customer, cu.whatsapp_id as whatsapp_id
    from appointments a join customers cu on cu.id = a.customer_id left join services s on s.id = a.service_id
    order by a.created_at desc limit 5`);
  console.log("appointments:", JSON.stringify(appts.rows));

  const out = await db.execute(sql`
    select status::text, attempt_count, error_code, left(last_error, 80) as err from outbox_messages order by seq desc limit 6`);
  console.log("outbox (newest first):", JSON.stringify(out.rows));
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
