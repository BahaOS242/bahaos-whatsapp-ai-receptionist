import { Router } from "express";

export const healthRouter = Router();

const startedAt = Date.now();

/**
 * Process liveness only — no database check in Phase 1. A DB readiness
 * check can be added once the app actually talks to a live Postgres
 * instance in a later phase.
 */
healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "bahaos-whatsapp-ai-receptionist",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});
