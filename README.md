# bahaos-whatsapp-ai-receptionist

Multi-tenant WhatsApp AI receptionist for dental practices (BahaOS).

See [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for product scope and
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the phased build
plan. This README covers local development only.

## Status

**Phase 1 complete:** TypeScript application foundation, tenant-aware
Postgres schema/migrations, environment validation, and baseline tests.

**Phase 4 (AI receptionist) in progress:** a real LLM provider now exists
alongside a deterministic rule-based one — see
[AI receptionist](#ai-receptionist) below. WhatsApp, Google Calendar,
email, and Railway are still not configured — see the plan for what's
next.

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
  config/env.ts       zod-validated environment configuration
  db/schema.ts         Drizzle ORM schema (tenant-aware Postgres tables)
  db/client.ts          lazy Postgres connection pool + Drizzle client
  routes/health.ts     GET /health liveness check
  app.ts                 Express app factory
  server.ts              entrypoint
  ai/
    types.ts             AIProvider / ReceptionistAgent / ReceptionistTools contracts
    business-context.ts  demo tenant data (Bahamas Dental Service)
    conversation-manager.ts  assembles a request from raw history/customer/message
    receptionist-agent.ts    orchestrator — the safety-enforcement boundary
    create-provider.ts   picks LLMProvider vs DevRuleBasedAIProvider from env
    providers/
      dev-rule-based-provider.ts   deterministic, no network, used by tests
      llm-provider.ts               parses/validates tool calls, builds the prompt
      llm-chat-client.ts            minimal chat-client interface (testable)
      openai-chat-client.ts         the only file that imports the `openai` SDK
      tool-definitions.ts           OpenAI function-calling schemas
      action-schemas.ts             zod validation for parsed tool-call arguments
  tools/
    receptionist-tools.ts  simulated action executors (create_lead, request_appointment, ...)
drizzle/                 generated SQL migrations (do not hand-edit)
tests/                    Vitest test suite (tests/ai/ covers the receptionist layer)
scripts/
  dev-chat.ts             interactive terminal chat against the real agent (`npm run chat`)
```

## AI receptionist

`ReceptionistAgent` orchestrates one turn: ask an `AIProvider` what to say
and do, execute whatever it proposes via `ReceptionistTools`, then decide
what the customer actually hears. Two `AIProvider` implementations exist:

- **`DevRuleBasedAIProvider`** — deterministic, regex-based, no network
  call, no API key. Used by every automated test and as the default when
  no LLM is configured.
- **`LLMProvider`** — calls a real LLM (OpenAI, via `OPENAI_API_KEY`) with
  native tool-calling. It only ever *proposes* actions
  (`create_lead`, `request_appointment`, `request_reschedule`,
  `request_cancellation`, `escalate`) — it never touches `src/db` or any
  other real system directly.

**Safety invariant, enforced in `ReceptionistAgent`, not trusted to either
provider:** the provider's reply is only ever sent to the customer as-is
if every action it requested actually succeeded. If the provider throws,
returns something unparseable, or any action fails (including a tool that
throws rather than returning failure), the agent overrides the reply with
an honest fallback and escalates automatically — the customer is never
told something succeeded when it didn't.

Run `npm run chat` for an interactive terminal conversation with the real
agent (uses `LLMProvider` automatically if `OPENAI_API_KEY` is set,
otherwise `DevRuleBasedAIProvider`).

## Environment variables

`.env.example` documents every variable the app currently reads
(including the optional `OPENAI_API_KEY`/`OPENAI_MODEL` for the LLM
receptionist provider), plus placeholders for variables later phases will
need (WhatsApp, Google Calendar, email, Railway). Do not populate the
placeholder section with real credentials until that phase is explicitly
authorized.
