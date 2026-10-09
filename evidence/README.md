# evidence/

`live-anthropic-haiku-4-5-2026-10-09.json` — raw output of ONE live run (Haiku 4.5, simulated tools, 15 synthetic cases × 3 passes) produced by the **pre-correction** harness at commit `5762e25`.

- A limited, named-model observation by the developer. **Not** an independent rerun, **not** a billing receipt (cost is an estimate from reported usage × a named price snapshot), **not** a reliability percentage.
- It has no per-turn action/result records, so the pre-confirmation safety assertion cannot be fully reconstructed from it. The corrected harness (`scripts/live-eval/`) records them; its controls are covered by offline tests in `tests/live-eval`.
- No further paid run is authorized by the existence of this file.

## live-anthropic-haiku-4-5-dd47d7f.json (run 2)
Run on the **corrected** harness at commit `dd47d7f6d9edbd705299751f2136be9aa6303118` (clean tree enforced, commit recorded inside): CORRECTED-15 + REPLACEMENT-27 × 3 passes, Haiku 4.5, **simulated booking tools only**. Records per-step actions with success flags. Estimated cost $1.6571 (usage × named price snapshot, not a receipt). REPLACEMENT-27 is a replacement — not the original 27; the historical 14/27 result is not rerun. Contains 6 hard-failure runs (R21, R22) — see RELEASE_GATE_CHECKLIST.md §1b.
