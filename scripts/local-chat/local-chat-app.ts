/**
 * LOCAL-ONLY browser chat for personally testing BahaOS. A FREE SIMULATION:
 *   - the deterministic rule-based fallback provider (DevRuleBasedAIProvider) — no AI API, no key, no network;
 *   - the in-memory simulated booking tools — no database, no Google Calendar;
 *   - no WhatsApp: nothing here can send a message anywhere.
 * It reuses the real ReceptionistAgent and ConversationManager (the same logic `npm run chat` and the webhook use).
 *
 * It is deliberately NOT part of the application: it lives under scripts/, is never imported from src/, is not mounted in
 * createApp or server.ts, reads no environment configuration or credentials, and refuses to start outside a developer's own
 * machine (assertLocalDevelopmentOnly) and to listen on anything but 127.0.0.1 (see server.ts). It is separate from any
 * other conversational-UI work.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { LLMProvider } from "../../src/ai/providers/llm-provider";
import type { AIProvider } from "../../src/ai/types";
import { LIVE_LABEL, type LiveSession } from "./live-mode";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { createSimulatedReceptionistTools } from "../../src/tools/receptionist-tools";
import type { BookingState, ConversationTurn } from "../../src/ai/types";

/** Environments in which this tool must never run: production, and the common hosting platforms. */
const HOSTING_MARKERS = ["RENDER", "RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "DYNO", "FLY_APP_NAME", "VERCEL", "KUBERNETES_SERVICE_HOST", "K_SERVICE", "AWS_EXECUTION_ENV"];

export function assertLocalDevelopmentOnly(env: NodeJS.ProcessEnv): void {
  const offending = env.NODE_ENV === "production" ? "NODE_ENV=production" : HOSTING_MARKERS.find((k) => env[k]);
  if (offending) {
    throw new Error(`The local test chat is for local development only and refuses to run here (${offending}). It is never deployed.`);
  }
}

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
const hostnameOf = (hostHeader: string | undefined): string => (hostHeader ?? "").replace(/:\d+$/, "").toLowerCase();
const MAX_MESSAGE_CHARS = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublicMessage { role: "customer" | "assistant"; text: string }
interface Conversation {
  mode: Mode;
  manager: ConversationManager;
  agent: ReceptionistAgent;
  history: ConversationTurn[];
  messages: PublicMessage[];
  queue: Promise<unknown>; // serialises turns within ONE conversation
}

export interface LocalChatOptions {
  /** Oldest conversations are evicted beyond this many (memory bound). */
  maxConversations?: number;
  /** Present only when the server was started in live mode with a key; absent => free simulation only. */
  live?: LiveSession;
}

type Mode = "free" | "live";

const PAGE_DIR = join(__dirname, "page");
const asset = (name: string) => readFileSync(join(PAGE_DIR, name), "utf8");

export function createLocalChatApp(options: LocalChatOptions = {}): Express {
  const maxConversations = options.maxConversations ?? 50;
  const live = options.live;
  const conversations = new Map<string, Conversation>();
  const app = express();
  app.disable("x-powered-by");

  // Local-only: only requests addressed to a loopback hostname are served (blocks DNS-rebinding from a web page).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!LOCAL_HOSTNAMES.has(hostnameOf(req.headers.host))) {
      res.status(403).type("text/plain").send("Local test chat: loopback access only.");
      return;
    }
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    next();
  });

  // Cross-site request defence for the API: a browser POST from another site carries a foreign Origin, and non-JSON bodies
  // (which would skip a CORS preflight) are refused.
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST") {
      const origin = req.headers.origin;
      if (origin !== undefined) {
        let originHost = "";
        try { originHost = new URL(origin).hostname.toLowerCase(); } catch { /* unparseable -> refused below */ }
        const bracketed = originHost.includes(":") && !originHost.startsWith("[") ? `[${originHost}]` : originHost;
        if (!LOCAL_HOSTNAMES.has(bracketed)) {
          res.status(403).json({ error: "cross-site request refused" });
          return;
        }
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "content-type must be application/json" });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "10kb" }));

  app.get("/", (_req, res) => res.type("html").send(asset("index.html")));
  app.get("/app.js", (_req, res) => res.type("application/javascript").send(asset("app.js")));
  app.get("/app.css", (_req, res) => res.type("text/css").send(asset("app.css")));

  app.get("/api/info", (_req, res) => {
    res.json({
      mode: "free_simulation",
      provider: "DevRuleBasedAIProvider",
      bookingTools: "simulated",
      realAi: false,
      realDatabase: false,
      realWhatsApp: false,
      // live mode: real model calls only; bookings remain simulated, and there is never a database/calendar/WhatsApp
      live: live ? live.snapshot() : { available: false },
    });
  });

  app.post("/api/conversations", (req, res) => {
    const requested = (req.body as { mode?: unknown } | undefined)?.mode ?? "free";
    if (requested !== "free" && requested !== "live") { res.status(400).json({ error: "mode must be 'free' or 'live'" }); return; }
    if (requested === "live" && !live) {
      res.status(409).json({ error: "Live mode is not enabled on this server (start it with: npm run chat:web:live)" });
      return;
    }
    const id = randomUUID();
    // a fresh provider AND fresh in-memory tools per conversation: nothing is shared between conversations or modes
    const provider: AIProvider = requested === "live" && live ? new LLMProvider(live.client) : new DevRuleBasedAIProvider();
    conversations.set(id, {
      mode: requested,
      manager: new ConversationManager(),
      agent: new ReceptionistAgent(provider, createSimulatedReceptionistTools(BAHAMAS_DENTAL_SERVICE)),
      history: [],
      messages: [],
      queue: Promise.resolve(),
    });
    while (conversations.size > maxConversations) conversations.delete(conversations.keys().next().value as string);
    res.status(201).json({ id, mode: requested, ...(requested === "live" && live ? { label: LIVE_LABEL } : {}) });
  });

  const lookup = (req: Request, res: Response): Conversation | undefined => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) { res.status(400).json({ error: "invalid conversation id" }); return undefined; }
    const conv = conversations.get(id);
    if (!conv) { res.status(404).json({ error: "unknown conversation (start a new one)" }); return undefined; }
    return conv;
  };

  app.get("/api/conversations/:id", (req, res) => {
    const conv = lookup(req, res);
    if (conv) res.json({ mode: conv.mode, messages: conv.messages, bookingState: conv.manager.getBookingState() as BookingState });
  });

  app.post("/api/conversations/:id/messages", async (req, res, next) => {
    const conv = lookup(req, res);
    if (!conv) return;
    const message = (req.body as { message?: unknown } | undefined)?.message;
    if (typeof message !== "string" || message.trim().length === 0 || message.length > MAX_MESSAGE_CHARS) {
      res.status(400).json({ error: `message must be 1-${MAX_MESSAGE_CHARS} characters` });
      return;
    }
    // Live mode that has halted (budget reached, unknown usage, failed request) sends NOTHING further to the model.
    if (conv.mode === "live" && live?.isHalted()) {
      res.status(409).json({ error: "Live mode has stopped for this session. Switch to Free simulation, or restart the server to reset the budget.", live: live.snapshot() });
      return;
    }
    try {
      const turn = conv.queue.then(async () => {
        const request = conv.manager.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history: conv.history, message });
        const result = await conv.agent.handleMessage(request);
        conv.history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
        conv.messages.push({ role: "customer", text: message }, { role: "assistant", text: result.reply });
        conv.manager.setBookingState(result.bookingState);
        conv.manager.setHandoffActive(result.handoffActive);
        return result;
      });
      conv.queue = turn.catch(() => undefined);
      const result = await turn;
      res.json({
        reply: result.reply,
        bookingState: conv.manager.getBookingState(),
        handoffActive: result.handoffActive,
        mode: conv.mode,
        ...(conv.mode === "live" && live ? { live: live.snapshot() } : {}),
        actions: result.actionsTaken.map((a) => ({ type: a.action.type, ok: a.result.success, ...(a.result.success ? {} : { error: a.result.error ?? "unknown" }) })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[local chat] error:", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "something went wrong in the simulation" });
  });

  return app;
}
