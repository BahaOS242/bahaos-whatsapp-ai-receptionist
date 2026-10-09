# Release gates

Manual checklist for owner review; this PR installs no CI enforcement. A green conversation percentage alone is insufficient. Current status: NOT READY; critical date/name findings and missing integration evidence remain.

| Gate | Required evidence | Current review status |
| --- | --- | --- |
| Identity integrity | Exact correction transcripts preserve correct identity in state, customer record and final action payload across fallback/shared LLM paths | Report failure; remote static finding; full rerun needed |
| Date integrity | Frozen-clock next-week Friday resolves October 16, 2026 in Nassau; final payload/UTC instant agree; rollover/timezone boundaries covered | Remote parser/timestamp defect reproduced |
| Confirmation | No mutation before explicit confirmation; each material identity/date/time/service/intent correction invalidates earlier approval | Code inspected; not executed here |
| Provider evaluation | Same corpus with fallback and live Anthropic using simulated tools; log model/version, clock, tool backend, failures and payloads | Baseline fallback 35/38 + 14/27; live Anthropic not tested in baseline/review |
| Persistence and isolation | Disposable DB tests for durable creation/reschedule/cancel, tenant/customer isolation, concurrency and restart | Not executed here |
| Replay and ownership | Same webhook ID yields one durable effect; takeover suppresses queued AI delivery; race/restart coverage | Not executed here |
| Phase 5 jobs | Fresh/upgrade migration, scheduling, leases/fencing, retry/max attempts, idempotency, cancellation, tenant/flag isolation, crash/multiprocess/shutdown, outbox protection | Local uncommitted work outside this review |
| Routine verification | Exact candidate SHA passes lint, typecheck, build, appropriate offline + disposable DB suites; eval failures triaged; reference calendar integrity preserved | Not executed here |
| Operations | Reviewed migration/deployment/rollback plan, default feature flags and required practice configuration; owner approval | Not authorized by this review |

Hard blockers: zero incorrect identity/date payloads in the verified regression corpus; no duplicate durable booking from replay; no unauthorized AI generation/delivery after takeover. Unexecuted gates remain open. Document every skip and its reason. Historical results must retain their original SHA/environment.

Claude should use a disposable test database and simulated messaging/calendar clients for integration verification. Live provider evaluation is a separate lane; scripted clients test application safeguards, not Anthropic language understanding. Do not infer DB, jobs or WhatsApp reliability from simulated conversation success.

Only the owner may authorize merge/deployment/production changes. Complete review and attach evidence to the candidate PR before requesting that decision.
