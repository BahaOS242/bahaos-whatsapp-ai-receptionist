import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { staffSessions, staffUsers, tenants } from "../db/schema";
import type { TransitionActor } from "./ownership";

/**
 * Staff authentication for the inbox. The repository had none (the
 * `staff_users.password_hash` column existed but nothing used it), so this is
 * the minimum safe mechanism, built from Node's own crypto — no new
 * dependency:
 *
 *   - passwords: scrypt with a per-user random salt, constant-time compare;
 *   - sessions: opaque 256-bit random bearer tokens; only their SHA-256 is
 *     stored, so a database leak yields no usable session;
 *   - a session is bound to ONE tenant (copied from the staff user at
 *     login); the tenant is NEVER read from a request;
 *   - login failures are indistinguishable (unknown tenant / user / bad
 *     password / locked / inactive all look the same, and cost the same
 *     scrypt work) and repeated failures lock the account temporarily;
 *   - bearer tokens in an Authorization header (not cookies) mean there is
 *     no ambient browser credential for CSRF to ride on.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 32;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, version, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || version !== "1" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A real hash of a throwaway secret, so a login for a nonexistent user does
// the same amount of work as a real one.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface CreateStaffInput {
  tenantId: string;
  email: string;
  name: string;
  role: "admin" | "staff";
  password: string;
}

export async function createStaffUser(db: Db, input: CreateStaffInput): Promise<{ id: string }> {
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const [row] = await db
    .insert(staffUsers)
    .values({
      tenantId: input.tenantId,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning({ id: staffUsers.id });
  return row;
}

export interface StaffIdentity extends TransitionActor {
  name: string;
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; staff: StaffIdentity }
  | { ok: false };

export async function login(
  db: Db,
  creds: { tenant: string; email: string; password: string },
  now: Date = new Date(),
): Promise<LoginResult> {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, String(creds.tenant ?? "").trim().toLowerCase()) });
  const user = tenant
    ? await db.query.staffUsers.findFirst({
        where: and(eq(staffUsers.tenantId, tenant.id), eq(staffUsers.email, String(creds.email ?? "").trim().toLowerCase())),
      })
    : undefined;

  const hash = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(String(creds.password ?? ""), hash);
  const locked = !!user?.lockedUntil && user.lockedUntil > now;

  if (!user || !tenant || !user.passwordHash || !user.isActive || locked || !passwordOk) {
    if (user && user.passwordHash && user.isActive && !locked && !passwordOk) {
      // ATOMIC increment: concurrent wrong guesses must each be counted, or
      // parallel requests could all read the same count and never trip the lockout.
      const lockUntil = new Date(now.getTime() + LOCKOUT_MS).toISOString();
      await db.execute(sql`
        UPDATE staff_users
           SET failed_login_count = CASE WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS} THEN 0 ELSE failed_login_count + 1 END,
               locked_until = CASE WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS} THEN ${lockUntil}::timestamptz ELSE locked_until END
         WHERE id = ${user.id}::uuid`);
    }
    return { ok: false };
  }

  await db.update(staffUsers).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(staffUsers.id, user.id));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(staffSessions).values({ tenantId: user.tenantId, staffUserId: user.id, tokenHash: sha256(token), expiresAt });
  return { ok: true, token, expiresAt, staff: { staffUserId: user.id, tenantId: user.tenantId, role: user.role, name: user.name } };
}

/** Resolves a bearer token to a verified staff identity, or null. The
 * returned tenantId is the session's own — the only tenant that request may
 * ever act in. */
export async function authenticate(db: Db, token: string | undefined, now: Date = new Date()): Promise<StaffIdentity | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const rows = await db
    .select({ session: staffSessions, user: staffUsers })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffUserId))
    .where(
      and(
        eq(staffSessions.tokenHash, sha256(token)),
        isNull(staffSessions.revokedAt),
        gt(staffSessions.expiresAt, now),
        eq(staffUsers.isActive, true),
        eq(staffUsers.tenantId, staffSessions.tenantId),
      ),
    )
    .limit(1);
  const hit = rows[0];
  if (!hit) return null;
  await db.update(staffSessions).set({ lastUsedAt: now }).where(eq(staffSessions.id, hit.session.id));
  return { staffUserId: hit.user.id, tenantId: hit.session.tenantId, role: hit.user.role, name: hit.user.name };
}

export async function logout(db: Db, token: string | undefined, now: Date = new Date()): Promise<void> {
  if (!token) return;
  await db.update(staffSessions).set({ revokedAt: now }).where(and(eq(staffSessions.tokenHash, sha256(token)), isNull(staffSessions.revokedAt)));
}

