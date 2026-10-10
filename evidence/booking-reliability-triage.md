# Safe-incomplete conversations grouped by root cause

Earlier run: commit `de1a1b179fdc79f56f7b4964b45fb1a15d5eb26e` — 189 safe-incomplete runs. Current run: commit `f9e73a408ed0ccc3ee21b35cbf5e6581b8dd18ba`.
Each earlier run is matched to the SAME scenario × provider × mode in the current run. Root causes are assigned by rule from the earlier transcript (see scripts/conversation-test/triage-compare.ts); genuine application stalls are listed before fixture mismatches.

| Root cause (earlier run) | Runs | Source groups | now: pass | now: completed-quality | now: script-mismatch | now: safe-incomplete | now: unsafe |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1. Typo'd key word not recognised (service / weekday / appointment) | 67 | 42 | 46 | 6 | 12 | 3 | 0 |
| 2. Request not recognised (symptom, visit or vague phrasing) | 26 | 13 | 17 | 8 | 1 | 0 | 0 |
| 4. Valid detail lost (after an out-of-hours/closed-day rejection, or an out-of-order answer) | 27 | 15 | 19 | 1 | 5 | 2 | 0 |
| 5. Question asked mid-booking but not answered (duration, directions, fees, unknown facts, other times) | 40 | 20 | 28 | 4 | 6 | 2 | 0 |
| 6. Same prompt/summary repeated verbatim (incl. an unrelated 'yes') | 29 | 16 | 10 | 8 | 7 | 4 | 0 |

Overall, the 189 earlier safe-incomplete runs now stand at: pass 120, completed-quality 27, script-mismatch 31, safe-incomplete 11, unsafe 0.

## What each root cause was and what fixed it

| # | Root cause (application, not fixture) | Fix |
|---|---|---|
| 1 | Key words with a single typo ("claening", "fillign", "Wendesday", "Tusday", "apointment") matched nothing, so the request was not understood | `src/ai/lexicon-repair.ts`: one-edit repair against a closed list (services, weekdays, "appointment", "tomorrow"), nearest-word tie-break, real words ("billing", "feeling") never rewritten |
| 2 | Natural requests not recognised: "something's wrong with my tooth, can I come in", "get my teeth checked", "check up", "I want a booking" | `src/ai/side-questions.ts` non-emergency symptom/check offer (assessment only, no diagnosis; emergencies still escalate), service aliases (`BusinessService.aliases`), "booking" as a booking word |
| 3 | Staff handoff after two unclear messages even though the request was clear | follows from 1 and 2; plus repeated-prompt recovery now offers an example, then "talk to someone", and hands off only after a third failed clarification |
| 4 | Valid details dropped: an out-of-hours time also erased the valid day; a closed day erased the valid time; a name given while the day was being asked was ignored; name + phone + a question in one message lost the name/phone; a name beside a service word was dropped | `rejectTime` clears only the invalid part; full names accepted anywhere with provenance; each sentence judged on its own; service words stripped before judging a name; a service+day/time request keeps every detail |
| 5 | Questions during booking got the booking prompt back (duration, directions, fees, other times, payment/parking/shuttle/amenities, treatment recommendations, unsupported services) | `answerSideQuestion`: configured facts answered, everything else an honest "I don't have that, front desk can confirm" (statement form, so the next yes stays unambiguous); the same message is also processed as a booking turn first so its details are kept |
| 6 | Identical prompt or summary repeated verbatim; an unrelated "yes" re-asked the same question; "No, that sounds right" read as a decline | example → human offer → handoff ladder; "still holding this for your answer" for repeated summaries; ambiguous no+agree asks once; a repeated yes after the request was recorded is acknowledged |
| – | (safety, found along the way) availability read as rejection: "I'm off that day so that works" cleared Tuesday | `schedule-proposal.ts` distinguishes availability / rejection / ambiguous; ambiguous "i off that day" asks |
| – | (safety) a second request for an already-held slot was created | simulated tools mirror production slot semantics; second request rejected as no longer available |

## Remaining booking blockers (development set)

* 11 runs are still safe-incomplete: TM-4b9c7860 and TM-4d9d8a2b (fallback, fixed and adaptive, with typo variants) and three scripted-LLM fixtures.
  In the fallback runs the booking is correct and fully authorised up to the last step; the fixture ends before the SECOND approval that the
  application correctly demands after an ambiguous "No thank you" / "No, that sounds right" (the adaptive customer never approves by design).
  They are not application stalls, but they are not demonstrated completions either.
* The scripted-LLM fixtures replay authored tool calls; they say nothing about live-model behaviour.
* Held-out evaluation has NOT been run. These numbers are development-set results on scenarios the fixes were written against.
