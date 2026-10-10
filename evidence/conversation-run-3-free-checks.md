# Free checks executed for conversation run 3

Tested commit (harness run, clean tree): `de1a1b179fdc79f56f7b4964b45fb1a15d5eb26e`, branch `claude/conversation-eval-phase5`.
Clock pinned to 2026-08-20T15:00Z for the harness and (via `tests/helpers/pin-clock.ts`) the date-sensitive suites. No paid or
live-model call, deployment, staging migration, merge or production change was made. Real WhatsApp delivery remains BLOCKED (unverified).

| Check | Result |
|---|---|
| `npx vitest run` (with dummy `DATABASE_URL=postgres://u:p@127.0.0.1:1/none`, never connected) | 97 files, 1652 passed + 2 expected-fail (recorded known gaps) |
| same, WITHOUT `DATABASE_URL` | the only failures are the env-dependent `health` (2), `create-provider` (1) and `inbox-api` (file) tests, as on the unmodified base |
| `vitest run --config vitest.db.config.mts` on a disposable local PostgreSQL 16 (migrations applied there only; torn down afterwards) | 33 files, 386 passed |
| `npx tsc --noEmit`, `npx eslint .`, `npm run build` | clean |
| `npx prettier --check` on every new/changed file in `scripts/conversation-test`, `tests/conversation-test`, `tests/regressions/{wrong-data-bookings,supplied-browser-conversations}.test.ts`, `src/ai/{name-provenance,schedule-proposal,approval-purity}.ts` | clean (existing files were NOT reformatted) |
| `npx tsx scripts/run-eval.ts` (fallback provider) | 37/38, unchanged from PR #2 (NL-01 only) |
| `npm run eval:conversations` | 210 executed runs, 0 harness errors; 12 held-out NOT run |

New regression coverage: `tests/regressions/wrong-data-bookings.test.ts` (83 tests; 63 failed on the pre-fix code) and
`tests/regressions/supplied-browser-conversations.test.ts`; validator tests in `tests/conversation-test/harness.test.ts`.
