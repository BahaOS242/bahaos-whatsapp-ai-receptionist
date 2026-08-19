# bahaos-whatsapp-ai-receptionist

Multi-tenant WhatsApp AI receptionist for dental practices (BahaOS).

See [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for product scope and
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the phased build
plan. This README covers local development only.

## Status

**Phase 1 complete:** TypeScript application foundation, tenant-aware
Postgres schema/migrations, environment validation, and baseline tests.
No external integrations (WhatsApp, OpenAI, Google Calendar, email,
Railway) are configured yet — see the plan for what's next.

## Prerequisites

- Node.js >= 20
- A PostgreSQL database (only needed to actually apply migrations or run
  the app against real data — the HTTP server itself starts with just a
  syntactically valid `DATABASE_URL`)

## Setup

```bash
npm install
cp .env.example .env
# edit .env — at minimum, point DATABASE_URL at a real Postgres instance
```

## Common commands

```bash
npm run dev            # start the dev server with auto-reload
npm run build           # compile TypeScript to dist/
npm start                # run the compiled server (after build)
npm run typecheck       # tsc --noEmit
npm run lint             # ESLint
npm run format:check    # Prettier check (format:write to fix)
npm test                  # Vitest, single run
npm run db:generate     # regenerate SQL migrations from src/db/schema.ts
npm run db:migrate      # apply pending migrations to DATABASE_URL
```

`npm run db:generate` diffs the Drizzle schema against the migration
history and does **not** need a live database connection. `npm run
db:migrate` does — it connects to whatever `DATABASE_URL` points at and
applies pending SQL files under `drizzle/`.

## Project layout

```
src/
  config/env.ts     zod-validated environment configuration
  db/schema.ts       Drizzle ORM schema (tenant-aware Postgres tables)
  db/client.ts        lazy Postgres connection pool + Drizzle client
  routes/health.ts   GET /health liveness check
  app.ts               Express app factory
  server.ts            entrypoint
drizzle/               generated SQL migrations (do not hand-edit)
tests/                  Vitest test suite
```

## Environment variables

`.env.example` documents every variable the app currently reads, plus
placeholders for variables later phases will need (WhatsApp, OpenAI,
Google Calendar, email, Railway). Do not populate the placeholder section
with real credentials until that phase is explicitly authorized.
