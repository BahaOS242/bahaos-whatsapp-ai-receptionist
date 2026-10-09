import express, { type Express, type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { createInboxRouter, type InboxRouterDeps } from "./inbox/router";
import { healthRouter } from "./routes/health";
import { createWhatsAppWebhookRouter, type WhatsAppWebhookDeps } from "./routes/whatsapp-webhook";

export function createApp(whatsAppDeps?: WhatsAppWebhookDeps, inboxDeps?: InboxRouterDeps): Express {
  const app = express();

  app.disable("x-powered-by");

  // Mounted BEFORE the global express.json() below: this router installs
  // its OWN json() body parser with a `verify` callback that captures
  // the exact raw bytes Meta sent, required for X-Hub-Signature-256
  // verification (a re-serialized/re-parsed body can't be trusted to
  // match the signature byte-for-byte). `whatsAppDeps` lets tests inject
  // a fake db/agent/messaging provider without a real Postgres or LLM;
  // omitted (the real server) it builds everything from env defaults.
  app.use("/webhooks/whatsapp", createWhatsAppWebhookRouter(whatsAppDeps));

  // Staff inbox: JSON API (bearer-session auth, tenant from the session) and
  // the dependency-free static UI. Own body parser inside the router.
  app.use("/api/inbox", createInboxRouter(inboxDeps));
  app.use(
    "/inbox",
    (_req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Strict-Transport-Security", "max-age=31536000"); // ignored over plain http; makes browsers insist on HTTPS
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cache-Control", "no-store");
      next();
    },
    express.static(path.join(__dirname, "..", "public", "inbox"), { index: "index.html" }),
  );

  app.use(express.json());

  app.use("/health", healthRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not_found" });
  });

  // Genuine defect found in this hardening pass: a malformed-JSON or
  // oversized-body error from body-parser (thrown from INSIDE
  // express.json(), before any route handler runs) carries its own
  // `status`/`statusCode` (400 for a parse failure, 413 for
  // "entity.too.large") — but falling through to a bare `res.status(500)`
  // here discarded that and reported every such error as a server fault.
  // For the WhatsApp webhook specifically this is not just cosmetically
  // wrong: Meta treats a 5xx response as "redeliver this," so a client
  // sending garbage (or an attacker probing the endpoint) would have
  // triggered pointless webhook retries instead of the 4xx that
  // correctly tells the sender their OWN request was bad and no
  // redelivery is going to fix it. Never leaks the error's own message/
  // stack to the client either way — those are logged server-side only.
  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const clientErrorStatus = err.status ?? err.statusCode;
    if (clientErrorStatus && clientErrorStatus >= 400 && clientErrorStatus < 500) {
      res.status(clientErrorStatus).json({ error: "bad_request" });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
