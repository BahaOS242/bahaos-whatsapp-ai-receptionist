# evidence/

`live-anthropic-haiku-4-5-2026-10-09.json` — raw output of ONE live run (Haiku 4.5, simulated tools, 15 synthetic cases × 3 passes) produced by the **pre-correction** harness at commit `5762e25`.

- A limited, named-model observation by the developer. **Not** an independent rerun, **not** a billing receipt (cost is an estimate from reported usage × a named price snapshot), **not** a reliability percentage.
- It has no per-turn action/result records, so the pre-confirmation safety assertion cannot be fully reconstructed from it. The corrected harness (`scripts/live-eval/`) records them; its controls are covered by offline tests in `tests/live-eval`.
- No further paid run is authorized by the existence of this file.
