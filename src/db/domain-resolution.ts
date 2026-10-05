import { and, eq } from "drizzle-orm";
import { customers, services, tenants } from "./schema";
import type { BusinessContext } from "../ai/types";
import type { Db } from "./client";

/**
 * The minimal bridge between the conversational world (a BusinessContext
 * object, a spoken service name, a phone number) and the real database's
 * foreign keys (tenantId/serviceId/customerId). Nothing here invents
 * data: every value resolved is either already present in BusinessContext
 * (services, business name/slug) or is the customer's own stated phone
 * number/name — this only ever finds-or-creates the ROW that represents
 * something the conversation already established, never guesses at
 * something it doesn't know.
 *
 * Single-tenant today (this product has exactly one BusinessContext,
 * BAHAMAS_DENTAL_SERVICE, hardcoded everywhere) — resolveTenant always
 * resolves to the same row, deterministically keyed by a slug derived
 * from the business name, rather than a hardcoded UUID, so the mechanism
 * is correct if/when a second tenant is ever added.
 */


function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/** Finds or creates the tenant row for this BusinessContext. Safe under
 * concurrent callers: relies on the existing tenants_slug_key unique
 * index, catching a conflicting concurrent insert and re-reading rather
 * than assuming this call was the one that won. */
export async function resolveTenant(db: Db, business: BusinessContext): Promise<string> {
  const slug = slugify(business.name);

  const existing = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(tenants)
      .values({ slug, name: business.name, timezone: business.timezone })
      .returning();
    return created.id;
  } catch {
    // Lost a concurrent create race for the same slug — the row exists
    // now, read it rather than treating this as a real failure.
    const raceWinner = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
    if (raceWinner) return raceWinner.id;
    throw new Error(`resolveTenant: insert failed and no row was found for slug "${slug}"`);
  }
}

/**
 * Finds or creates the service row matching `serviceName` for this
 * tenant. Returns undefined (never invents a row) if `serviceName` isn't
 * one of BusinessContext's own defined services — this should never
 * happen in practice, since the application itself is the only thing
 * that ever proposes a service name (see message-field-extraction.ts's
 * findService), but it's checked here rather than assumed.
 */
export async function resolveService(
  db: Db,
  tenantId: string,
  business: BusinessContext,
  serviceName: string,
): Promise<{ serviceId: string; durationMinutes: number } | undefined> {
  const definition = business.services.find((s) => s.name === serviceName);
  if (!definition) return undefined;

  const existing = await db.query.services.findFirst({
    where: and(eq(services.tenantId, tenantId), eq(services.name, serviceName)),
  });
  if (existing) return { serviceId: existing.id, durationMinutes: existing.durationMinutes };

  try {
    const [created] = await db
      .insert(services)
      .values({
        tenantId,
        name: definition.name,
        durationMinutes: definition.durationMinutes,
      })
      .returning();
    return { serviceId: created.id, durationMinutes: created.durationMinutes };
  } catch {
    const raceWinner = await db.query.services.findFirst({
      where: and(eq(services.tenantId, tenantId), eq(services.name, serviceName)),
    });
    if (raceWinner) {
      return { serviceId: raceWinner.id, durationMinutes: raceWinner.durationMinutes };
    }
    throw new Error(`resolveService: insert failed and no row was found for "${serviceName}"`);
  }
}

/** Finds or creates the customer row for this phone number. Updates
 * displayName when a new one is provided and differs from what's on
 * file — a customer correcting their name (or giving it for the first
 * time on a later turn) should update the record, not be silently
 * ignored. Safe under concurrent callers via customers_tenant_whatsapp_id_key. */
export async function resolveCustomer(
  db: Db,
  tenantId: string,
  phone: string,
  name?: string,
): Promise<string> {
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.tenantId, tenantId), eq(customers.whatsappId, phone)),
  });
  if (existing) {
    if (name && existing.displayName !== name) {
      await db.update(customers).set({ displayName: name }).where(eq(customers.id, existing.id));
    }
    return existing.id;
  }

  try {
    const [created] = await db
      .insert(customers)
      .values({ tenantId, whatsappId: phone, displayName: name })
      .returning();
    return created.id;
  } catch {
    const raceWinner = await db.query.customers.findFirst({
      where: and(eq(customers.tenantId, tenantId), eq(customers.whatsappId, phone)),
    });
    if (raceWinner) return raceWinner.id;
    throw new Error(`resolveCustomer: insert failed and no row was found for phone "${phone}"`);
  }
}
