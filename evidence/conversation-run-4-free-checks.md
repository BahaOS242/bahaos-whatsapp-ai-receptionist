# Free checks executed for conversation run 4 (booking reliability)

Tested commit (harness run, clean tree): `f9e73a408ed0ccc3ee21b35cbf5e6581b8dd18ba`, branch `claude/conversation-eval-phase5`
(a pure descendant of `claude/phase5-jobs-and-receptionist-fixes` @ `2de0f98`; nothing merged, `main` untouched).
Clock pinned to 2026-08-20T15:00Z. No paid or live-model call, deployment, staging migration, merge or production change.
Real WhatsApp delivery remains BLOCKED (unverified).

| Check | Result |
|---|---|
| `npx vitest run` (dummy `DATABASE_URL=postgres://u:p@127.0.0.1:1/none`, never connected) | 99 files, 1733 passed |
| same without `DATABASE_URL` | only the env-dependent `health` (2), `create-provider` (1) and `inbox-api` (file) tests fail, as on the unmodified Phase 5 base |
| `vitest run --config vitest.db.config.mts` on a disposable local PostgreSQL 16 (migrations applied there only; torn down) | 33 files, 386 passed |
| `npx tsc --noEmit`, `npx eslint .`, `npm run build` | clean |
| `npx tsx scripts/run-eval.ts` (fallback) | 38/38 (was 37/38 on the base; NL-01 now fixed by typo tolerance) |
| `npm run eval:conversations` | 210 executed runs, 0 harness errors; 12 held-out NOT run |

Regression coverage added/changed this round: `availability-vs-rejection` (23, the Codex case: positive + negative, both lanes),
`booking-completion` (56), `supplied-browser-conversations` (7, former known gaps closed), and three existing pins updated because the behaviour they
documented as a gap is now fixed (`tests/torture/out-of-order` #11/#14, `tests/ai/business-hours-flow` + `tests/torture/partial-input` day retention,
`tests/eval/corpus` 38/38).
