import express, { Router, type NextFunction, type Request, type Response } from "express";
import type { Db } from "../db/client";
import { getDb } from "../db/client";
import { authenticate, login, logout, type StaffIdentity } from "./auth";
import {
  acceptHandoff, assignConversation, closeConversation, reopenConversation, returnToAi, takeOverConversation,
  type TransitionResult,
} from "./ownership";
import { getConversationDetail, listAssignableStaff, listConversations, type InboxFilter } from "./queries";
import { retryFailedStaffMessage, sendStaffReply } from "./staff-reply";

/**
 * Staff inbox API. Every route except /login requires a bearer session; the
 * tenant is taken ONLY from that session. Unknown ids and ids belonging to
 * another tenant are indistinguishable (404), so existence never leaks.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTERS = new Set<InboxFilter>(["all", "pending", "human", "ai", "closed"]);

export interface InboxRouterDeps {
  db?: Db;
  now?: () => Date;
}

type Authed = Request & { staff: StaffIdentity };

function bearer(req: Request): string | undefined {
  const h = req.header("authorization");
  const m = h && /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : undefined;
}

const STATUS: Record<string, number> = {
  not_found: 404, forbidden: 403, invalid_transition: 409, stale: 409, invalid_assignee: 422,
  customer_has_active_conversation: 409, invalid_body: 422, invalid_client_id: 422, idempotency_conflict: 409,
};

function fail(res: Response, reason: string, detail?: string, extra: object = {}) {
  // not_found and forbidden-on-foreign-tenant are already the same 404 at the service layer.
  res.status(STATUS[reason] ?? 400).json({ error: reason, ...(detail ? { detail } : {}), ...extra });
}

export function createInboxRouter(deps: InboxRouterDeps = {}): Router {
  const router = Router();
  const db = () => deps.db ?? getDb();
  const now = () => (deps.now ? deps.now() : new Date());

  router.use(express.json({ limit: "32kb" }));
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post("/login", async (req, res, next) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const r = await login(db(), { tenant: String(b.tenant ?? ""), email: String(b.email ?? ""), password: String(b.password ?? "") }, now());
      if (!r.ok) return void res.status(401).json({ error: "invalid_credentials" });
      res.json({ token: r.token, expiresAt: r.expiresAt, staff: { id: r.staff.staffUserId, name: r.staff.name, role: r.staff.role } });
    } catch (e) { next(e); }
  });

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const staff = await authenticate(db(), bearer(req), now());
      if (!staff) return void res.status(401).json({ error: "unauthenticated" });
      (req as Authed).staff = staff;
      next();
    } catch (e) { next(e); }
  });

  const pid = (r: Request) => String(r.params.id);
  const who = (req: Request) => (req as Authed).staff;

  router.post("/logout", async (req, res, next) => {
    try { await logout(db(), bearer(req), now()); res.json({ ok: true }); } catch (e) { next(e); }
  });

  router.get("/me", (req, res) => {
    const s = who(req);
    res.json({ id: s.staffUserId, name: s.name, role: s.role });
  });

  router.get("/staff", async (req, res, next) => {
    try { res.json({ staff: await listAssignableStaff(db(), who(req)) }); } catch (e) { next(e); }
  });

  router.get("/conversations", async (req, res, next) => {
    try {
      const f = String(req.query.filter ?? "all") as InboxFilter;
      if (!FILTERS.has(f)) return void fail(res, "invalid_body", "unknown filter");
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(await listConversations(db(), who(req), { filter: f, q: typeof req.query.q === "string" ? req.query.q : undefined, limit: Number.isFinite(limit) ? limit : undefined }));
    } catch (e) { next(e); }
  });

  router.param("id", (_req, res, next, id) => {
    if (!UUID.test(id)) return void fail(res, "not_found");
    next();
  });

  router.get("/conversations/:id", async (req, res, next) => {
    try {
      const d = await getConversationDetail(db(), who(req), pid(req));
      if (!d) return void fail(res, "not_found");
      res.json(d);
    } catch (e) { next(e); }
  });

  const expected = (req: Request) => {
    const v = (req.body as { expectedVersion?: unknown } | undefined)?.expectedVersion;
    return typeof v === "number" && Number.isInteger(v) ? { expectedVersion: v } : {};
  };
  const respond = (res: Response, r: TransitionResult) => {
    if (r.ok) return void res.json({ ok: true, conversation: r.conversation, withdrawnAiReplies: r.withdrawnAiReplies });
    fail(res, r.reason, r.detail, r.currentStatus ? { currentStatus: r.currentStatus } : {});
  };

  const transitions: Array<[string, (req: Request) => Promise<TransitionResult>]> = [
    ["accept", (q) => acceptHandoff(db(), who(q), pid(q), expected(q))],
    ["takeover", (q) => takeOverConversation(db(), who(q), pid(q), expected(q))],
    ["release", (q) => returnToAi(db(), who(q), pid(q), expected(q))],
    ["reopen", (q) => reopenConversation(db(), who(q), pid(q), expected(q))],
    ["close", (q) => {
      const n = (q.body as { note?: unknown } | undefined)?.note;
      return closeConversation(db(), who(q), pid(q), typeof n === "string" ? n.slice(0, 500) : undefined, expected(q));
    }],
    ["assign", (q) => {
      const a = (q.body as { assigneeId?: unknown } | undefined)?.assigneeId;
      if (typeof a !== "string" || !UUID.test(a)) return Promise.resolve({ ok: false, reason: "invalid_assignee" } as TransitionResult);
      return assignConversation(db(), who(q), pid(q), a, expected(q));
    }],
  ];
  for (const [name, fn] of transitions) {
    router.post(`/conversations/:id/${name}`, async (req, res, next) => {
      try { respond(res, await fn(req)); } catch (e) { next(e); }
    });
  }

  router.post("/conversations/:id/reply", async (req, res, next) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const r = await sendStaffReply(db(), who(req), pid(req), { body: b.body, clientMessageId: b.clientMessageId });
      if (!r.ok) return void fail(res, r.reason, r.detail);
      // 202: accepted into the durable outbox; delivery is reported by status polling, not claimed here.
      res.status(r.deduplicated ? 200 : 202).json({ ok: true, messageId: r.messageId, deduplicated: r.deduplicated });
    } catch (e) { next(e); }
  });

  router.post("/conversations/:id/messages/:messageId/retry", async (req, res, next) => {
    try {
      if (!UUID.test(String(req.params.messageId))) return void fail(res, "not_found");
      const r = await retryFailedStaffMessage(db(), who(req), pid(req), String(req.params.messageId));
      if (!r.ok) return void fail(res, r.reason, r.detail);
      res.status(202).json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}
