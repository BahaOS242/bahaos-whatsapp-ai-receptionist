# Conversation Test Report (Taskmaster-derived BahaOS evaluation)

- Head commit under test: `ba3671dde678b1fe2a7b02eac486f0482c454b96` (working tree contained uncommitted evaluation files at run time)
- Generated: 2026-10-10T01:18:16.987Z
- Providers: **dev-rule-based fallback** (free, deterministic, simulated tools) and **scripted LLM fixture** (free; authored scripts, NOT model output).
- Paid/live-model runs: **none**. Deployment, staging migration, merge: **none**.

## Summary

| Group | Pass | Fail | Incomplete | Not run |
|---|---:|---:|---:|---:|
| Fallback — adaptations (48) | 4 | 44 | 0 | 0 |
| Fallback — typo variants | 0 | 46 | 0 | 0 |
| Fallback — Bahamian augmentation | 0 | 8 | 0 | 0 |
| Scripted-LLM fixtures | 0 | 6 | 0 | 0 |
| Held-out (reserved) | 0 | 0 | 0 | 12 |

## Key findings (fallback provider; see transcripts)

- Wrong data booked: booking actions were executed with junk patient names taken from ordinary sentences (e.g. "Yes", "For My", "Please", "That Is Perfect", "How Long Will It Take?", "Try"). See TM-0b5b803f, TM-66c6b5b1, TM-1671146d, TM-17420eb9.
- Correction ignored: in TM-60cceb98 the customer changed 12:30 to 1:30 at the confirmation step, the reply restated 12:30, and the booking was executed for 12:30.
- Questions during confirmation are ignored: the confirmation summary is repeated verbatim instead of answering duration/address questions (TM-da2f3e45), and the generic 'What day and time works best for you?' is repeated after validated details were already given (TM-929b59a3).
- Details lost: a name given before the date was never stored in TM-929b59a3 (booking could not proceed).
- Mis-routed handoff: non-emergency scheduling conversations escalated to staff after the receptionist failed to understand repeated messages (TM-65958f69, TM-70bc0cb6, TM-73b0e503, TM-209856e2) and the holding reply then repeated for every later message.
- Good behaviour observed: emergency symptoms escalated without booking (TM-cacb2e3c, TM-038e5414); out-of-hours times were rejected; Saturday/evening requests were not booked.

## Free test baseline

Free automated tests run first (no network, no paid calls): `npx vitest run` = 904 passed / 18 failed (922). The same 18 failures exist at the unmodified base commit: 2 need DATABASE_URL (tests/health.test.ts) and the other 16 are date-assertion failures that appear to depend on the real clock (e.g. 'Oct 8' now resolves to 2027); the 16 were not individually root-caused. `tsc --noEmit` and eslint are clean for the new files. The master reliability prompt referenced in the task was NOT in the package or repository, so its requirements could not be read; this report uses CLAUDE_HANDOFF.md requirements and the existing regression suites (tests/ai/*regression*, tests/torture) only.

## Common failure themes (fallback provider)

| Check | Count | Source groups affected |
|---|---:|---:|
| repeated-reply | 214 | 39 |
| tool_safety | 84 | 43 |
| resolution | 68 | 45 |
| booking-count | 63 | 42 |
| reply-must-match | 41 | 20 |
| detail-loss | 2 | 2 |

## Attribution and method

Source conversations: Google Taskmaster-1 (TM-1-2019) self-dialogs by Bill Byrne, Karthik Krishnamoorthi, Chinnadhurai Sankar, Arvind Neelakantan, Amit Dubey, Kyu-Young Kim and Andy Cedilnik (Google LLC), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://github.com/google-research-datasets/Taskmaster. MODIFIED: every scenario here is an original BahaOS dental-clinic adaptation of a conversational mechanism; no source text, prices, dates, phone numbers or assistant replies are reused. Source dialogs are crowd-authored role-play, not real customer logs.

- Customer turns are scripted and fixed. They do not react to the receptionist's actual questions, so a reply that asks a differently-ordered question than the script assumes can cause a legitimate-looking failure; every failure below includes the full transcript so it can be judged.
- Expected outcomes encode what a correct receptionist should do under the configured clinic facts (Mon–Fri 9–5; four services/prices; unconfigured facts deferred to staff). They are not derived from current behaviour and not from any source assistant reply.
- Validators (`scripts/conversation-test/checks.ts`) read only the recorded transcript: exactly-one booking, separate confirmation, no false completion claims, no repeated identical replies, no loss of validated details, no unconfigured prices or foreign-domain talk, per-scenario reply rules.
- Held-out set: 12 source IDs reserved, never adapted, never run. See `scripts/conversation-test/held-out.ts`.

## Held-out (reserved, NOT RUN)

- dlg-9001c89d-d35f-47f8-a1a7-1b701970e763 — not-run (reserved for final evaluation)
- dlg-515e9095-2f23-401d-abe6-cfacff005015 — not-run (reserved for final evaluation)
- dlg-9b6ee6f9-077a-44fb-88c6-850a4b6be59a — not-run (reserved for final evaluation)
- dlg-dc40549e-f111-4a5f-8653-31b84a60a57f — not-run (reserved for final evaluation)
- dlg-40327ffd-4c23-482e-8af8-8513e0f67c0f — not-run (reserved for final evaluation)
- dlg-6629e2af-0c4b-4b3c-af40-39ade8fab6ed — not-run (reserved for final evaluation)
- dlg-7f771330-3d82-40ee-b4c4-79b90949b700 — not-run (reserved for final evaluation)
- dlg-e1d94686-209c-4d7d-ae38-acdf6d2ee0f4 — not-run (reserved for final evaluation)
- dlg-3700dfe8-9f75-4116-9461-b26b0a71f99d — not-run (reserved for final evaluation)
- dlg-4df4e178-f98c-47b9-a928-7ec9dda7ff70 — not-run (reserved for final evaluation)
- dlg-0302389b-1308-4579-b1ba-ef6b45337137 — not-run (reserved for final evaluation)
- dlg-1b35767a-2396-4f13-98e8-c0eeec6e2d12 — not-run (reserved for final evaluation)

## Scenario results

| ID | Variant | Provider | Status | Source | Mechanism |
|---|---|---|---|---|---|
| TM-65958f69 | adaptation | dev-rule-based fallback | FAIL | dlg-65958f69 | same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message |
| TM-929b59a3 | adaptation | dev-rule-based fallback | FAIL | dlg-929b59a3 | details out of order (name/phone before date), price question mid-flow, time retried after refusal |
| TM-cacb2e3c | adaptation | dev-rule-based fallback | PASS | dlg-cacb2e3c | urgent symptom + user changes availability + asks for a named staff member + insurance + price |
| TM-e32859b3 | adaptation | dev-rule-based fallback | FAIL | dlg-e32859b3 | service + hours question, day-of-week preference, declining an upsell, graceful close |
| TM-5cb6cabb | adaptation | dev-rule-based fallback | FAIL | dlg-5cb6cabb | customer asks for other times, price question, then explicit go-ahead |
| TM-5d1a2f2e | adaptation | dev-rule-based fallback | FAIL | dlg-5d1a2f2e | booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up |
| TM-66c6b5b1 | adaptation | dev-rule-based fallback | FAIL | dlg-66c6b5b1 | hard deadline (needs it done before a trip), booking for a family member, price question |
| TM-87484a2b | adaptation | dev-rule-based fallback | FAIL | dlg-87484a2b | request is narrowed after a list of problems; customer rejects the first offered time as too late |
| TM-a8533b60 | adaptation | dev-rule-based fallback | FAIL | dlg-a8533b60 | ambiguous 'tomorrow morning' + fragments (one fact per message) |
| TM-b2e78e29 | adaptation | dev-rule-based fallback | FAIL | dlg-b2e78e29 | name interrupted/corrected, payment + rental + transport questions with unconfigured answers |
| TM-da2f3e45 | adaptation | dev-rule-based fallback | FAIL | dlg-da2f3e45 | preferred day, duration question, directions request |
| TM-db02658a | adaptation | dev-rule-based fallback | PASS | dlg-db02658a | price first, then book; joking aside; add-on symptom raised after contact details |
| TM-136f95ec | adaptation | dev-rule-based fallback | FAIL | dlg-136f95ec | terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact |
| TM-1671146d | adaptation | dev-rule-based fallback | FAIL | dlg-1671146d | multi-turn availability negotiation: day refused, 'too early', alternative accepted |
| TM-29f37e32 | adaptation | dev-rule-based fallback | FAIL | dlg-29f37e32 | urgency + successive earlier-time pushes; booking must respect business hours |
| TM-3d00c7a6 | adaptation | dev-rule-based fallback | FAIL | dlg-3d00c7a6 | conflict with customer's own meeting, then add-on request, partial contact info over several turns |
| TM-4b9c7860 | adaptation | dev-rule-based fallback | FAIL | dlg-4b9c7860 | drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help |
| TM-4ebc6c62 | adaptation | dev-rule-based fallback | FAIL | dlg-4ebc6c62 | assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference |
| TM-53cfb4bd | adaptation | dev-rule-based fallback | FAIL | dlg-53cfb4bd | weekend request against weekday-only hours; customer relents to a valid weekday morning |
| TM-60cceb98 | adaptation | dev-rule-based fallback | FAIL | dlg-60cceb98 | late correction of a stated time after contact details are given |
| TM-70bc0cb6 | adaptation | dev-rule-based fallback | FAIL | dlg-70bc0cb6 | vague problem, wrong-vehicle correction, same-day pressure, repair-duration question |
| TM-71cbe988 | adaptation | dev-rule-based fallback | FAIL | dlg-71cbe988 | customer repeats name/phone after an after-work time change |
| TM-73b0e503 | adaptation | dev-rule-based fallback | FAIL | dlg-73b0e503 | pain symptom + immediate availability push + evening fallback accepted reluctantly |
| TM-7a8274ab | adaptation | dev-rule-based fallback | FAIL | dlg-7a8274ab | customer asks the assistant to use an 'online tool', pushes same-day then accepts later time |
| TM-8e3522af | adaptation | dev-rule-based fallback | FAIL | dlg-8e3522af | frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service |
| TM-92975e16 | adaptation | dev-rule-based fallback | FAIL | dlg-92975e16 | date negotiated across turns, fee question, add-on mid-flow, final read-back |
| TM-9f67b33c | adaptation | dev-rule-based fallback | FAIL | dlg-9f67b33c | multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk) |
| TM-e0a60506 | adaptation | dev-rule-based fallback | FAIL | dlg-e0a60506 | customer volunteers extra personal detail (home address) and 'urgent as soon as possible' |
| TM-003677eb | adaptation | dev-rule-based fallback | FAIL | dlg-003677eb | driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid |
| TM-038e5414 | adaptation | dev-rule-based fallback | PASS | dlg-038e5414 | multiple warning symptoms at once + shuttle + 'make it later today' |
| TM-078a0f20 | adaptation | dev-rule-based fallback | FAIL | dlg-078a0f20 | customer pushes for something sooner then books the later slot; read-back confirmation; polite close |
| TM-17420eb9 | adaptation | dev-rule-based fallback | FAIL | dlg-17420eb9 | question the system cannot answer from configuration ('ask them what I've done in the past'), duration question |
| TM-1b47bb2b | adaptation | dev-rule-based fallback | FAIL | dlg-1b47bb2b | propose slot -> anything later? -> switch provider -> seat-type request unsupported |
| TM-0b5b803f | adaptation | dev-rule-based fallback | FAIL | dlg-0b5b803f | slot change request, then revert to original slot, then change of 'venue' (service) |
| TM-1159607c | adaptation | dev-rule-based fallback | FAIL | dlg-1159607c | off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered' |
| TM-3660ae8b | adaptation | dev-rule-based fallback | FAIL | dlg-3660ae8b | repeated alternative probing at one time slot, then customer gives up (abandon with no booking) |
| TM-590f7375 | adaptation | dev-rule-based fallback | FAIL | dlg-590f7375 | criteria search (cuisine, budget, rating) + hotel location question + group split |
| TM-5e0469c8 | adaptation | dev-rule-based fallback | FAIL | dlg-5e0469c8 | alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation |
| TM-92fb5414 | adaptation | dev-rule-based fallback | FAIL | dlg-92fb5414 | customer gives up after repeated slot misses (abandon without booking) |
| TM-c4801b6b | adaptation | dev-rule-based fallback | FAIL | dlg-c4801b6b | frustration after failed attempts, then withdrawal |
| TM-0341f269 | adaptation | dev-rule-based fallback | PASS | dlg-0341f269 | name two venues in sequence; party-size and day given; 'change my reservation to a different place' |
| TM-0907b949 | adaptation | dev-rule-based fallback | FAIL | dlg-0907b949 | tonight slot, then 7?, then back to original time, high-chair special request added late |
| TM-0ea74929 | adaptation | dev-rule-based fallback | FAIL | dlg-0ea74929 | seat preference change, venue switch, tasting-menu / head-chef questions, final time change |
| TM-0f57a901 | adaptation | dev-rule-based fallback | FAIL | dlg-0f57a901 | headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises |
| TM-209856e2 | adaptation | dev-rule-based fallback | FAIL | dlg-209856e2 | assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter |
| TM-4d9d8a2b | adaptation | dev-rule-based fallback | FAIL | dlg-4d9d8a2b | special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details |
| TM-55ab43fe | adaptation | dev-rule-based fallback | FAIL | dlg-55ab43fe | spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation |
| TM-56325402 | adaptation | dev-rule-based fallback | FAIL | dlg-56325402 | recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start |
| TM-65958f69-T | typo | dev-rule-based fallback | FAIL | dlg-65958f69 | same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message |
| TM-929b59a3-T | typo | dev-rule-based fallback | FAIL | dlg-929b59a3 | details out of order (name/phone before date), price question mid-flow, time retried after refusal |
| TM-e32859b3-T | typo | dev-rule-based fallback | FAIL | dlg-e32859b3 | service + hours question, day-of-week preference, declining an upsell, graceful close |
| TM-5cb6cabb-T | typo | dev-rule-based fallback | FAIL | dlg-5cb6cabb | customer asks for other times, price question, then explicit go-ahead |
| TM-5d1a2f2e-T | typo | dev-rule-based fallback | FAIL | dlg-5d1a2f2e | booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up |
| TM-66c6b5b1-T | typo | dev-rule-based fallback | FAIL | dlg-66c6b5b1 | hard deadline (needs it done before a trip), booking for a family member, price question |
| TM-87484a2b-T | typo | dev-rule-based fallback | FAIL | dlg-87484a2b | request is narrowed after a list of problems; customer rejects the first offered time as too late |
| TM-a8533b60-T | typo | dev-rule-based fallback | FAIL | dlg-a8533b60 | ambiguous 'tomorrow morning' + fragments (one fact per message) |
| TM-b2e78e29-T | typo | dev-rule-based fallback | FAIL | dlg-b2e78e29 | name interrupted/corrected, payment + rental + transport questions with unconfigured answers |
| TM-da2f3e45-T | typo | dev-rule-based fallback | FAIL | dlg-da2f3e45 | preferred day, duration question, directions request |
| TM-db02658a-T | typo | dev-rule-based fallback | FAIL | dlg-db02658a | price first, then book; joking aside; add-on symptom raised after contact details |
| TM-136f95ec-T | typo | dev-rule-based fallback | FAIL | dlg-136f95ec | terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact |
| TM-1671146d-T | typo | dev-rule-based fallback | FAIL | dlg-1671146d | multi-turn availability negotiation: day refused, 'too early', alternative accepted |
| TM-29f37e32-T | typo | dev-rule-based fallback | FAIL | dlg-29f37e32 | urgency + successive earlier-time pushes; booking must respect business hours |
| TM-3d00c7a6-T | typo | dev-rule-based fallback | FAIL | dlg-3d00c7a6 | conflict with customer's own meeting, then add-on request, partial contact info over several turns |
| TM-4b9c7860-T | typo | dev-rule-based fallback | FAIL | dlg-4b9c7860 | drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help |
| TM-4ebc6c62-T | typo | dev-rule-based fallback | FAIL | dlg-4ebc6c62 | assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference |
| TM-53cfb4bd-T | typo | dev-rule-based fallback | FAIL | dlg-53cfb4bd | weekend request against weekday-only hours; customer relents to a valid weekday morning |
| TM-60cceb98-T | typo | dev-rule-based fallback | FAIL | dlg-60cceb98 | late correction of a stated time after contact details are given |
| TM-70bc0cb6-T | typo | dev-rule-based fallback | FAIL | dlg-70bc0cb6 | vague problem, wrong-vehicle correction, same-day pressure, repair-duration question |
| TM-71cbe988-T | typo | dev-rule-based fallback | FAIL | dlg-71cbe988 | customer repeats name/phone after an after-work time change |
| TM-73b0e503-T | typo | dev-rule-based fallback | FAIL | dlg-73b0e503 | pain symptom + immediate availability push + evening fallback accepted reluctantly |
| TM-7a8274ab-T | typo | dev-rule-based fallback | FAIL | dlg-7a8274ab | customer asks the assistant to use an 'online tool', pushes same-day then accepts later time |
| TM-8e3522af-T | typo | dev-rule-based fallback | FAIL | dlg-8e3522af | frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service |
| TM-92975e16-T | typo | dev-rule-based fallback | FAIL | dlg-92975e16 | date negotiated across turns, fee question, add-on mid-flow, final read-back |
| TM-9f67b33c-T | typo | dev-rule-based fallback | FAIL | dlg-9f67b33c | multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk) |
| TM-e0a60506-T | typo | dev-rule-based fallback | FAIL | dlg-e0a60506 | customer volunteers extra personal detail (home address) and 'urgent as soon as possible' |
| TM-003677eb-T | typo | dev-rule-based fallback | FAIL | dlg-003677eb | driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid |
| TM-078a0f20-T | typo | dev-rule-based fallback | FAIL | dlg-078a0f20 | customer pushes for something sooner then books the later slot; read-back confirmation; polite close |
| TM-17420eb9-T | typo | dev-rule-based fallback | FAIL | dlg-17420eb9 | question the system cannot answer from configuration ('ask them what I've done in the past'), duration question |
| TM-1b47bb2b-T | typo | dev-rule-based fallback | FAIL | dlg-1b47bb2b | propose slot -> anything later? -> switch provider -> seat-type request unsupported |
| TM-0b5b803f-T | typo | dev-rule-based fallback | FAIL | dlg-0b5b803f | slot change request, then revert to original slot, then change of 'venue' (service) |
| TM-1159607c-T | typo | dev-rule-based fallback | FAIL | dlg-1159607c | off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered' |
| TM-3660ae8b-T | typo | dev-rule-based fallback | FAIL | dlg-3660ae8b | repeated alternative probing at one time slot, then customer gives up (abandon with no booking) |
| TM-590f7375-T | typo | dev-rule-based fallback | FAIL | dlg-590f7375 | criteria search (cuisine, budget, rating) + hotel location question + group split |
| TM-5e0469c8-T | typo | dev-rule-based fallback | FAIL | dlg-5e0469c8 | alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation |
| TM-92fb5414-T | typo | dev-rule-based fallback | FAIL | dlg-92fb5414 | customer gives up after repeated slot misses (abandon without booking) |
| TM-c4801b6b-T | typo | dev-rule-based fallback | FAIL | dlg-c4801b6b | frustration after failed attempts, then withdrawal |
| TM-0341f269-T | typo | dev-rule-based fallback | FAIL | dlg-0341f269 | name two venues in sequence; party-size and day given; 'change my reservation to a different place' |
| TM-0907b949-T | typo | dev-rule-based fallback | FAIL | dlg-0907b949 | tonight slot, then 7?, then back to original time, high-chair special request added late |
| TM-0ea74929-T | typo | dev-rule-based fallback | FAIL | dlg-0ea74929 | seat preference change, venue switch, tasting-menu / head-chef questions, final time change |
| TM-0f57a901-T | typo | dev-rule-based fallback | FAIL | dlg-0f57a901 | headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises |
| TM-209856e2-T | typo | dev-rule-based fallback | FAIL | dlg-209856e2 | assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter |
| TM-4d9d8a2b-T | typo | dev-rule-based fallback | FAIL | dlg-4d9d8a2b | special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details |
| TM-55ab43fe-T | typo | dev-rule-based fallback | FAIL | dlg-55ab43fe | spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation |
| TM-56325402-T | typo | dev-rule-based fallback | FAIL | dlg-56325402 | recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start |
| TM-929b59a3-B | bahamian | dev-rule-based fallback | FAIL | dlg-929b59a3 | details out of order (name/phone before date), price question mid-flow, time retried after refusal |
| TM-5cb6cabb-B | bahamian | dev-rule-based fallback | FAIL | dlg-5cb6cabb | customer asks for other times, price question, then explicit go-ahead |
| TM-66c6b5b1-B | bahamian | dev-rule-based fallback | FAIL | dlg-66c6b5b1 | hard deadline (needs it done before a trip), booking for a family member, price question |
| TM-a8533b60-B | bahamian | dev-rule-based fallback | FAIL | dlg-a8533b60 | ambiguous 'tomorrow morning' + fragments (one fact per message) |
| TM-3d00c7a6-B | bahamian | dev-rule-based fallback | FAIL | dlg-3d00c7a6 | conflict with customer's own meeting, then add-on request, partial contact info over several turns |
| TM-60cceb98-B | bahamian | dev-rule-based fallback | FAIL | dlg-60cceb98 | late correction of a stated time after contact details are given |
| TM-078a0f20-B | bahamian | dev-rule-based fallback | FAIL | dlg-078a0f20 | customer pushes for something sooner then books the later slot; read-back confirmation; polite close |
| TM-0b5b803f-B | bahamian | dev-rule-based fallback | FAIL | dlg-0b5b803f | slot change request, then revert to original slot, then change of 'venue' (service) |
| TM-929b59a3 | adaptation | scripted LLM fixture | FAIL | dlg-929b59a3 | details out of order (name/phone before date), price question mid-flow, time retried after refusal |
| TM-5cb6cabb | adaptation | scripted LLM fixture | FAIL | dlg-5cb6cabb | customer asks for other times, price question, then explicit go-ahead |
| TM-a8533b60 | adaptation | scripted LLM fixture | FAIL | dlg-a8533b60 | ambiguous 'tomorrow morning' + fragments (one fact per message) |
| TM-60cceb98 | adaptation | scripted LLM fixture | FAIL | dlg-60cceb98 | late correction of a stated time after contact details are given |
| TM-078a0f20 | adaptation | scripted LLM fixture | FAIL | dlg-078a0f20 | customer pushes for something sooner then books the later slot; read-back confirmation; polite close |
| TM-0b5b803f | adaptation | scripted LLM fixture | FAIL | dlg-0b5b803f | slot change request, then revert to original slot, then change of 'venue' (service) |

## Full transcripts

### TM-65958f69 — FAIL (dev-rule-based fallback (free))

- Source: dlg-65958f69-c7c0-4dd9-931e-eb0497091f50 (auto-repair-appt-1), variant: adaptation, seed 1000
- Mechanism: same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message
- Changes: car/shop -> dental filling at Bahamas Dental Service; 'today' replaced by a configured weekday (clock-independent); second complaint becomes a free-text note; no second service invented
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hi, can I get a filling this week? Any time before you close.
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time).
   _state:_ `{}`
2. **Customer:** yes
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
3. **Customer:** Wednesday 3pm
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
4. **Customer:** actually it's the upper left tooth, not the right
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Now that you mention it another tooth is sensitive too, note that please
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Alicia Moss 242-555-0111
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-929b59a3 — FAIL (dev-rule-based fallback (free))

- Source: dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1), variant: adaptation, seed 1001
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 8] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** I'd like to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Brent Cole
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** 242-555-0112
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning"}`
5. **Customer:** Thursday 6pm
   **Receptionist:** 6:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning"}`
6. **Customer:** Can I come in at 4pm then?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`
7. **Customer:** How much will the cleaning be?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`
8. **Customer:** Okay, that's fine.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`
9. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`

### TM-cacb2e3c — PASS (dev-rule-based fallback (free))

- Source: dlg-cacb2e3c-c504-441a-8e9d-e605164c6415 (auto-repair-appt-1), variant: adaptation, seed 1002
- Mechanism: urgent symptom + user changes availability + asks for a named staff member + insurance + price
- Changes: car rattle -> severe tooth pain (emergency policy applies); named mechanic request -> named dentist (staff names unconfigured, must not be invented); insurance answered from configured policy only
- Expected: outcome `escalated`, bookings 0, action 
- Actual outcome: escalated

1. **Customer:** Hi, my tooth is killing me, swollen face and I can't sleep
   **Receptionist:** Emergency requests are handed to staff rather than booked automatically — flag it as urgent so the team can call back promptly.
   _state:_ `{}` _actions:_ escalate
2. **Customer:** I'm Carla Dean, 242-555-0113
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
3. **Customer:** Can I see Dr Bill like I did before?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** I have insurance, how much is the exam?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-e32859b3 — FAIL (dev-rule-based fallback (free))

- Source: dlg-e32859b3-88ca-4617-b7ce-1bc9cd4d42cb (auto-repair-appt-1), variant: adaptation, seed 1003
- Mechanism: service + hours question, day-of-week preference, declining an upsell, graceful close
- Changes: oil change/tune-up -> consultation + cleaning request (one service per booking); 'what days are you open' answered from configured hours
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** Hi, can I schedule a dental consultation?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **Customer:** No, I haven't been before.
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **Customer:** What days are you open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
4. **Customer:** Okay. I can do any time on Mondays actually.
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
5. **Customer:** Morning would be best, 10am
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"10:00"}`
6. **Customer:** Dario Finn 242-555-0114
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","time":"10:00"}`
7. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","time":"10:00"}`
8. **Customer:** No that's it, thanks!
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","time":"10:00"}`

### TM-5cb6cabb — FAIL (dev-rule-based fallback (free))

- Source: dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1), variant: adaptation, seed 1004
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "What day works best for you?"
- ❌ [reply-must-match @turn 4] configured price: reply did not match /B\$\s?125/ — "What day works best for you?"

1. **Customer:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday 8am
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** Are there other times available?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
5. **Customer:** 9am works. What will it cost?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"09:00"}`
6. **Customer:** Erin Hall 242-555-0115
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","time":"09:00"}`
7. **Customer:** Great! Please go ahead
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","time":"09:00"}`
8. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning","time":"09:00"}`

### TM-5d1a2f2e — FAIL (dev-rule-based fallback (free))

- Source: dlg-5d1a2f2e-63eb-45a4-b18e-71035ef62e8e (auto-repair-appt-1), variant: adaptation, seed 1005
- Mechanism: booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up
- Changes: tune-up + oil change + stalling -> filling and a cleaning request; inspection fee -> B$75 consultation price only; no invented fee; multiple services: one is booked, the other is flagged, nothing is silently dropped
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I want an appointment at my regular dentist
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** I need a filling, and a cleaning if possible
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Friday 8am
   **Receptionist:** 8:00 AM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** ok then 9am Friday
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00"}`
5. **Customer:** Frank Gill, 242-555-0116
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
7. **Customer:** If it changes I'll call back.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`

### TM-66c6b5b1 — FAIL (dev-rule-based fallback (free))

- Source: dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1), variant: adaptation, seed 1006
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}) not found in order

1. **Customer:** Hi, I'd like a cleaning
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** I need it done before Wednesday because I'm travelling.
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
3. **Customer:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
4. **Customer:** It's for my wife, Janet Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"For My","date":"Wednesday","time":"10:00"}`
5. **Customer:** 242-555-0117
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"For My","phone":"+12425550117","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **Customer:** How much will it cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"For My","phone":"+12425550117","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, October 14 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **Customer:** Sounds great, thank you
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-87484a2b — FAIL (dev-rule-based fallback (free))

- Source: dlg-87484a2b-afe9-4d39-8b24-6118576737a9 (auto-repair-appt-1), variant: adaptation, seed 1007
- Mechanism: request is narrowed after a list of problems; customer rejects the first offered time as too late
- Changes: multi-problem car visit -> customer lists three dental concerns then narrows to a filling
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}) not found in order
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day and time works best for you?"

1. **Customer:** Hello I need an appointment please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** I have a cavity, my gums bleed and I'd like a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Actually I just want the filling done first
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **Customer:** Name is Lola Abbott, 242-555-0118
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Name Is Lola Abbott","phone":"+12425550118","service":"Basic filling"}`
5. **Customer:** Next Thursday is too far, what about Tuesday 11am?
   **Receptionist:** I have you down for Basic filling on Thursday, October 15 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Name Is Lola Abbott","phone":"+12425550118","service":"Basic filling","date":"2026-10-15","time":"11:00","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, October 15 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-a8533b60 — FAIL (dev-rule-based fallback (free))

- Source: dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1), variant: adaptation, seed 1008
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And what time? (please include am/pm)"

1. **Customer:** I need an appointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **Customer:** A cleaning
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **Customer:** John Smith
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
4. **Customer:** 2425550119
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","phone":"+12425550119","date":"Monday","service":"Routine cleaning"}`
5. **Customer:** yes that works, 9:30
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`
6. **Customer:** ok please do
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`

### TM-b2e78e29 — FAIL (dev-rule-based fallback (free))

- Source: dlg-b2e78e29-bb98-4a4b-aa72-1dc4296cf2cc (auto-repair-appt-1), variant: adaptation, seed 1009
- Mechanism: name interrupted/corrected, payment + rental + transport questions with unconfigured answers
- Changes: 'do you accept checks' / 'rental place nearby' -> unconfigured facts must be deferred
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Matthew Ross","phone":"+12425550120"}
- Actual outcome: completed
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "I have you down for Basic filling on Friday, October 16 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [reply-must-match @turn 6] parking is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?"

1. **Customer:** Hi, this is Matt, I need a filling
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **Customer:** Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"10:00"}`
4. **Customer:** Oh sorry, it's Matthew Ross, 242-555-0120
   **Receptionist:** I have you down for Basic filling on Friday, October 16 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
5. **Customer:** Do you accept checks?
   **Receptionist:** I have you down for Basic filling on Friday, October 16 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Matthew Ross","phone":"+12425550120","date":"Friday","time":"10:00","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Friday, October 16 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
7. **Customer:** Is there parking nearby?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`

### TM-da2f3e45 — FAIL (dev-rule-based fallback (free))

- Source: dlg-da2f3e45-5d76-4e15-8ae9-d7cafe2873b7 (auto-repair-appt-1), variant: adaptation, seed 1010
- Mechanism: preferred day, duration question, directions request
- Changes: oil change -> cleaning; directions answered from the configured address only
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"10:00","name":"Gina Hart","phone":"+12425550121"}
- Actual outcome: completed
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "I have you down for Routine cleaning on Tuesday, October 13 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "I have you down for Routine cleaning on Tuesday, October 13 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [reply-must-match @turn 4] cleaning duration is 60 minutes: reply did not match /60/ — "I have you down for Routine cleaning on Tuesday, October 13 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [reply-must-match @turn 5] address only; no invented turn-by-turn directions: reply did not match /Shirley/ — "I have you down for Routine cleaning on Tuesday, October 13 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **Customer:** I need to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"10:00"}`
4. **Customer:** Gina Hart, 242-555-0121
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **Customer:** How long will it take?
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **Customer:** Can you give me directions?
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Gina Hart","phone":"+12425550121","service":"Routine cleaning","date":"Tuesday","time":"10:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, October 13 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-db02658a — PASS (dev-rule-based fallback (free))

- Source: dlg-db02658a-e254-4b8a-949e-7cb7ca04800c (auto-repair-appt-1), variant: adaptation, seed 1011
- Mechanism: price first, then book; joking aside; add-on symptom raised after contact details
- Changes: oil change price query -> cleaning price query; no source prices; nail in tire -> sudden tooth sensitivity (note only); address joke ignored safely
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"10:00","name":"Hugh Ince","phone":"+12425550122"}
- Actual outcome: completed

1. **Customer:** How much is a cleaning?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes.
   _state:_ `{}`
2. **Customer:** ok let's book the cleaning Wednesday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
3. **Customer:** Hugh Ince 242-555-0122
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
4. **Customer:** Just kidding about the address, you don't need it
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
5. **Customer:** Actually one of my teeth has been sensitive, add that to the visit
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, October 14 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-136f95ec — FAIL (dev-rule-based fallback (free))

- Source: dlg-136f95ec-e309-4246-a6d9-2b4e8beaba7f (auto-repair-appt-1), variant: adaptation, seed 1012
- Mechanism: terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact
- Changes: car model/size answers -> no-op noise ('XL') that must not corrupt state
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}
- Actual outcome: completed
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day and time works best for you?"

1. **Customer:** Hi I would like to book a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** XL
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** Morning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
5. **Customer:** 10am Thursday
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"10:00"}`
6. **Customer:** Jon Madden
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","service":"Routine cleaning","date":"Thursday","time":"10:00"}`
7. **Customer:** 242-555-0123
   **Receptionist:** I have you down for Routine cleaning on Thursday, October 15 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
8. **Customer:** Thanks, can you tell me how much it will cost?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Thursday, October 15 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Jon Madden","phone":"+12425550123","service":"Routine cleaning","date":"Thursday","time":"10:00","pendingAction":"confirm_booking"}`
9. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, October 15 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1671146d — FAIL (dev-rule-based fallback (free))

- Source: dlg-1671146d-10be-460d-9f3a-ecb758f8078c (auto-repair-appt-1), variant: adaptation, seed 1013
- Mechanism: multi-turn availability negotiation: day refused, 'too early', alternative accepted
- Changes: busy-Thursday and 'too early' negotiation preserved; tire PSI request removed (unsupported)
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}) not found in order
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Could I get your name and phone number?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "And the best phone number to reach you?"

1. **Customer:** I need a dental exam
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **Customer:** Thursday 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday","time":"09:00"}`
4. **Customer:** Sorry, no. I forgot, my schedule is busy on Thursday.
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday","time":"09:00"}`
5. **Customer:** Friday please
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Please","date":"Thursday","time":"09:00"}`
6. **Customer:** That's too early. Any other time on Friday?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Please","date":"Thursday","time":"09:00"}`
7. **Customer:** Friday 1pm works
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Please","date":"Thursday","time":"09:00"}`
8. **Customer:** Ian Poole 242-555-0124
   **Receptionist:** I have you down for Dental consultation / basic exam on Thursday, October 15 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Please","phone":"+12425550124","date":"Thursday","time":"09:00","pendingAction":"confirm_booking"}`
9. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Thursday, October 15 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-29f37e32 — FAIL (dev-rule-based fallback (free))

- Source: dlg-29f37e32-23e0-4f19-aab7-916a40861608 (auto-repair-appt-1), variant: adaptation, seed 1014
- Mechanism: urgency + successive earlier-time pushes; booking must respect business hours
- Changes: 7am/8am requests are outside configured hours (opens 9); axle/pulling symptom -> mild jaw ache (not an emergency)
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"
- ❌ [reply-must-match @turn 4] 8am rejected: reply did not match /open|hours|9/ — "What day works best for you?"

1. **Customer:** I want a consultation, my jaw has been aching
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **Customer:** Jake Bauers, 242-555-0125
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125"}`
4. **Customer:** This is urgent. Can I come at 7am Tuesday?
   **Receptionist:** 7:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125"}`
5. **Customer:** What about 8am?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","time":"08:00"}`
6. **Customer:** Nothing earlier than that?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125","time":"08:00"}`
7. **Customer:** Oh ok, then 9am Tuesday.
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125"}`
8. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Jake Bauers","phone":"+12425550125"}`

### TM-3d00c7a6 — FAIL (dev-rule-based fallback (free))

- Source: dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1), variant: adaptation, seed 1015
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}) not found in order
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [reply-must-match @turn 5] tire rotation is not a clinic service: reply did not match /can't|cannot|don't|do not|not (something|offer)|dental|services|we offer/ — "And the best phone number to reach you?"

1. **Customer:** I need a cleaning, tomorrow or later today if you can
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
4. **Customer:** That is perfect
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"That Is Perfect","date":"Wednesday","time":"10:00"}`
5. **Customer:** Let me think.
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"That Is Perfect","date":"Wednesday","time":"10:00"}`
6. **Customer:** I also need my tires rotated
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"That Is Perfect","date":"Wednesday","time":"10:00"}`
7. **Customer:** Maggie Rivera
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"That Is Perfect","date":"Wednesday","time":"10:00"}`
8. **Customer:** yes. 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"That Is Perfect","phone":"+12425550126","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
9. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, October 14 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-4b9c7860 — FAIL (dev-rule-based fallback (free))

- Source: dlg-4b9c7860-5de3-40ea-a210-57ecbca80427 (auto-repair-appt-1), variant: adaptation, seed 1016
- Mechanism: drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help
- Changes: shuttle -> unconfigured amenity; must be deferred, never confirmed
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [reply-must-match @turn 3] shuttle is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Want details on one, or should I help you book? Could I get your name and phone number?"

1. **Customer:** Hello, I want to make an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday morning, 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
4. **Customer:** Igor Horne, 242-555-0127. Also my record is under my personal number, please note it. Do you offer a shuttle?
   **Receptionist:** We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Want details on one, or should I help you book? Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
5. **Customer:** No thank you, I'll arrange it myself
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
6. **Customer:** yes
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`

### TM-4ebc6c62 — FAIL (dev-rule-based fallback (free))

- Source: dlg-4ebc6c62-8065-46ec-ba02-0766a86bcb8a (auto-repair-appt-1), variant: adaptation, seed 1017
- Mechanism: assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference
- Changes: 'the shop I went to last time' -> 'same as my last visit': no history exists, must not invent one
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"

1. **Customer:** Can you book me for the same thing as last time?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A cleaning, I guess
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** Thursday 2pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
5. **Customer:** Name is Kara Lowe, use 242-555-0128 not my other number
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00"}`
6. **Customer:** yes
   **Receptionist:** I have you down for Routine cleaning on Thursday, October 15 at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550128","service":"Routine cleaning","date":"Thursday","time":"14:00","pendingAction":"confirm_booking"}`

### TM-53cfb4bd — FAIL (dev-rule-based fallback (free))

- Source: dlg-53cfb4bd-089b-4d88-9497-e928a7d4eb8c (auto-repair-appt-1), variant: adaptation, seed 1018
- Mechanism: weekend request against weekday-only hours; customer relents to a valid weekday morning
- Changes: Saturday March 30 -> Saturday (closed per configured hours); 'ask Jim' -> no staff names; ask for a morning slot
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}) not found in order

1. **Customer:** Hi, I'd like a cleaning but I'm busy this week, can we try Saturday?
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Saturday morning 9am
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** 11am won't work, I have brunch. Can you do 9?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"11:00"}`
5. **Customer:** OK what about Friday 9am then?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"11:00","date":"Friday"}`
6. **Customer:** Nia Vance, 242-555-0129
   **Receptionist:** I have you down for Routine cleaning on Friday, October 16 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Nia Vance","phone":"+12425550129","time":"11:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **Customer:** How much is the cleaning?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Friday, October 16 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Nia Vance","phone":"+12425550129","time":"11:00","date":"Friday","pendingAction":"confirm_booking"}`
8. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, October 16 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-60cceb98 — FAIL (dev-rule-based fallback (free))

- Source: dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1), variant: adaptation, seed 1019
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **Customer:** I'd like a cleaning next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **Customer:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
5. **Customer:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, October 13 at 12:30 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-70bc0cb6 — FAIL (dev-rule-based fallback (free))

- Source: dlg-70bc0cb6-d391-4f7e-bf11-bcc65e3363f3 (auto-repair-appt-1), variant: adaptation, seed 1020
- Mechanism: vague problem, wrong-vehicle correction, same-day pressure, repair-duration question
- Changes: vehicle correction (Ram vs Corolla) -> service correction (filling vs cleaning); 'how long will it take to fix' -> must give only configured procedure duration
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hey, something's wrong with my tooth, can I come in sometime soon?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Suzy Baker, 242-555-0131
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Sorry, I meant a filling, not a cleaning
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Is there anything this afternoon? Thursday 4pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** How long will it take if there's a problem?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** ok that works
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-71cbe988 — FAIL (dev-rule-based fallback (free))

- Source: dlg-71cbe988-8a26-4217-b466-db33a1840d46 (auto-repair-appt-1), variant: adaptation, seed 1021
- Mechanism: customer repeats name/phone after an after-work time change
- Changes: duplicate contact message must not duplicate or corrupt state; evening time clipped to 5pm close
- Expected: outcome `unresolved`, bookings 0
- Actual outcome: unresolved
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day works best for you?"
- ❌ [reply-must-match @turn 3] 5pm start for a 30-minute consultation passes the 5pm close; must not silently accept a slot that ends after closing: reply did not match /5|hours|open|close|latest|end/ — "What day works best for you?"

1. **Customer:** I'd like to book a general check-up and a filling
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **Customer:** A consultation first
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **Customer:** Tomorrow morning at 10 am would be ideal
   **Receptionist:** We're closed on Saturday, October 10. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **Customer:** Actually I'd prefer after work, do you have 5pm?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","time":"17:00"}`
5. **Customer:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Basic filling","time":"17:00"}`
6. **Customer:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Basic filling","time":"17:00"}`
7. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","service":"Basic filling","time":"17:00"}`

### TM-73b0e503 — FAIL (dev-rule-based fallback (free))

- Source: dlg-73b0e503-42ec-49e8-839a-1104907f686e (auto-repair-appt-1), variant: adaptation, seed 1022
- Mechanism: pain symptom + immediate availability push + evening fallback accepted reluctantly
- Changes: clutch failing -> loose crown (urgent but not an emergency); 'this evening' is after hours and must not be booked
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hello, I need to get my tooth looked at, a crown came loose
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Mina Shaw, 242-555-0133
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** It's a consultation. Do you have anything today around 2?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** How about this evening?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Okay, Wednesday 3pm then
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-7a8274ab — FAIL (dev-rule-based fallback (free))

- Source: dlg-7a8274ab-8a70-44f3-80df-197601afc7d6 (auto-repair-appt-1), variant: adaptation, seed 1023
- Mechanism: customer asks the assistant to use an 'online tool', pushes same-day then accepts later time
- Changes: 'online tool' is this chat itself; assistant must not claim to call or text third parties
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** Hi, can you set up an appointment for me?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** I'd like to get it done today if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-10-09"}`
5. **Customer:** How's 4:30pm? Thursday
   **Receptionist:** 4:30 PM on Friday, October 9 is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","name":"How's ?","service":"Routine cleaning"}`
6. **Customer:** What about 5:30pm?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"How's ?","service":"Routine cleaning","time":"17:30"}`
7. **Customer:** Arnold Benjamin, 242-555-0134
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"How's ?","phone":"+12425550134","service":"Routine cleaning","time":"17:30"}`
8. **Customer:** Thursday 4pm is fine then
   **Receptionist:** 5:30 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","name":"How's ?","phone":"+12425550134","service":"Routine cleaning"}`
9. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"How's ?","phone":"+12425550134","service":"Routine cleaning"}`

### TM-8e3522af — FAIL (dev-rule-based fallback (free))

- Source: dlg-8e3522af-9e99-405b-baa4-737eefbd2c4f (auto-repair-appt-1), variant: adaptation, seed 1024
- Mechanism: frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service
- Changes: window leak/rain -> chipped tooth; 'rental car' request -> unsupported third-party task
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "I have you down for Basic filling on Friday at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "I have you down for Basic filling on Friday at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **Customer:** I need a filling today, my tooth chipped
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **Customer:** Pat Cruz, 242-555-0135
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Pat Cruz","phone":"+12425550135"}`
3. **Customer:** Is there no way we can have it done today? Nothing is making it change?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Pat Cruz","phone":"+12425550135","date":"2026-10-09"}`
4. **Customer:** How much was it going to be, you never said?
   **Receptionist:** Basic filling is B$175 and takes about 45 minutes. And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Pat Cruz","phone":"+12425550135","date":"2026-10-09"}`
5. **Customer:** This is ridiculous, I can't believe there's nothing today
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Pat Cruz","phone":"+12425550135","date":"2026-10-09"}`
6. **Customer:** Fine, book Wednesday 2pm. Run it by me again first.
   **Receptionist:** I have you down for Basic filling on Friday at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Pat Cruz","phone":"+12425550135","date":"2026-10-09","time":"14:00","pendingAction":"confirm_booking"}`
7. **Customer:** Okay, that's fine.
   **Receptionist:** I have you down for Basic filling on Friday at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Pat Cruz","phone":"+12425550135","date":"2026-10-09","time":"14:00","pendingAction":"confirm_booking"}`
8. **Customer:** Also please arrange a ride for me for tomorrow
   **Receptionist:** I have you down for Basic filling on Friday at 2:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"Pat Cruz","phone":"+12425550135","date":"2026-10-09","time":"14:00","pendingAction":"confirm_booking"}`

### TM-92975e16 — FAIL (dev-rule-based fallback (free))

- Source: dlg-92975e16-5436-4179-9f4c-e680c623271e (auto-repair-appt-1), variant: adaptation, seed 1025
- Mechanism: date negotiated across turns, fee question, add-on mid-flow, final read-back
- Changes: inspection fee -> consultation price; 'add oil change' -> add cleaning note, no silent drops
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}) not found in order
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 4] configured price: reply did not match /B\$\s?75/ — "Could I get your name and phone number?"

1. **Customer:** Hello, I think I'm due for a check-up, can you set up an appointment?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** Yes that would be great.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Thursday morning before work would work best
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Thursday"}`
4. **Customer:** Friday 9am is fine then
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Thursday","time":"09:00"}`
5. **Customer:** Can you ask what the exam fee is?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"Thursday","time":"09:00","service":"Dental consultation / basic exam"}`
6. **Customer:** Lena Ford, 242-555-0136
   **Receptionist:** I have you down for Dental consultation / basic exam on Thursday, October 15 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Lena Ford","phone":"+12425550136","date":"Thursday","time":"09:00","service":"Dental consultation / basic exam","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Thursday, October 15 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-9f67b33c — FAIL (dev-rule-based fallback (free))

- Source: dlg-9f67b33c-4074-4acf-9b9d-17f69bc00073 (auto-repair-appt-1), variant: adaptation, seed 1026
- Mechanism: multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk)
- Changes: loaner car -> unconfigured perk; must not accept or promise one
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}) not found in order
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [reply-must-match @turn 3] up-front fee policy is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "What day and time works best for you?"

1. **Customer:** Hello, I'm calling to book an appointment
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** I'm Michael Gibson, 242-555-0137
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137"}`
3. **Customer:** A cleaning, and I also want something checked, a strange pain when I bite
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
4. **Customer:** Do you charge any fee up front?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137","service":"Routine cleaning"}`
5. **Customer:** See if you can fit me in Monday at 9am
   **Receptionist:** I have you down for Routine cleaning on Monday, October 12 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
6. **Customer:** Do you offer a loaner or ride service?
   **Receptionist:** We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Want details on one, or should I help you book? I have you down for Routine cleaning on Monday, October 12 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137","service":"Routine cleaning","date":"Monday","time":"09:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, October 12 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-e0a60506 — FAIL (dev-rule-based fallback (free))

- Source: dlg-e0a60506-5c3f-4308-a716-34f02f27e273 (auto-repair-appt-1), variant: adaptation, seed 1027
- Mechanism: customer volunteers extra personal detail (home address) and 'urgent as soon as possible'
- Changes: street address volunteered -> not collected; must not be stored as name/phone
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Could I get your name?"

1. **Customer:** I need an appointment please, my tooth has a loud ache, maybe I need a filling
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **Customer:** Max Reed
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **Customer:** My address is 12 Palm Ave, Nassau
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
5. **Customer:** 2425550138
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550138","service":"Basic filling"}`
6. **Customer:** It's urgent, as soon as possible. Tuesday 9am?
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00"}`
7. **Customer:** Please schedule it. What about the cost?
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00"}`
8. **Customer:** yes
   **Receptionist:** I have you down for Basic filling on Tuesday, October 13 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550138","service":"Basic filling","date":"Tuesday","time":"09:00","pendingAction":"confirm_booking"}`

### TM-003677eb — FAIL (dev-rule-based fallback (free))

- Source: dlg-003677eb-20f8-4b1e-a396-c0f95a786543 (auto-repair-appt-1), variant: adaptation, seed 1028
- Mechanism: driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid
- Changes: 4:45pm for a 60-minute cleaning ends after the 5pm close
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Henry James","phone":"+18885430099"}
- Actual outcome: completed
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [detail-loss @turn 4] date changed from "Friday" to undefined without a customer correction

1. **Customer:** Hey, I'm driving, set me up for a cleaning and a filling please
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** A cleaning first
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **Customer:** It's pretty urgent. What's the earliest you have, Friday?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
4. **Customer:** I really need it today before my trip tomorrow
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday"}`
5. **Customer:** No that's too late. Could I get in at 4:45pm Friday?
   **Receptionist:** 4:45 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
6. **Customer:** Friday 3pm is fine, thanks
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **Customer:** Henry James, 888 543 0099
   **Receptionist:** I have you down for Routine cleaning on Friday, October 16 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Henry James","phone":"+18885430099","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, October 16 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-038e5414 — PASS (dev-rule-based fallback (free))

- Source: dlg-038e5414-bc32-426b-8c19-9e583bf18cc5 (auto-repair-appt-1), variant: adaptation, seed 1029
- Mechanism: multiple warning symptoms at once + shuttle + 'make it later today'
- Changes: dashboard alerts -> multiple dental alarm symptoms (swelling, fever, pain): emergency handoff
- Expected: outcome `escalated`, bookings 0, action 
- Actual outcome: escalated

1. **Customer:** Hi, is this the dentist?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** I need to come in, I'm Jake
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** My face is swollen, I have a fever and a terrible toothache since yesterday
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Can you make it later today?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Do you have a shuttle to bring me home?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-078a0f20 — FAIL (dev-rule-based fallback (free))

- Source: dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1), variant: adaptation, seed 1030
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}
- Actual outcome: completed
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Could I get your name and phone number?"

1. **Customer:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **Customer:** Anything sooner than 3pm?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
5. **Customer:** oh well. book Wednesday 3pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **Customer:** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, October 14 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **Customer:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-17420eb9 — FAIL (dev-rule-based fallback (free))

- Source: dlg-17420eb9-65ab-46ae-9e6b-f0031d415ea7 (auto-repair-appt-1), variant: adaptation, seed 1031
- Mechanism: question the system cannot answer from configuration ('ask them what I've done in the past'), duration question
- Changes: service-history lookup is unavailable to the receptionist; must not invent history
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}) not found in order
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Could I get your name?"
- ❌ [reply-must-match @turn 4] cleaning duration: reply did not match /60/ — "I have you down for Routine cleaning on Tuesday, October 13 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **Customer:** Can you make an appointment for me? I need a cleaning and a filling
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A cleaning first. 242-555-0140 is my number, Mike Jones
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning"}`
3. **Customer:** Tuesday 11am
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
4. **Customer:** I have no idea what I've had done before. Ask them what I've had in the past.
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00"}`
5. **Customer:** How long will it take?
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"How Long Will It Take?","phone":"+12425550140","service":"Routine cleaning","date":"Tuesday","time":"11:00","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, October 13 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1b47bb2b — FAIL (dev-rule-based fallback (free))

- Source: dlg-1b47bb2b-61b1-46b2-879a-719e939cf2f5 (restaurant-table-2), variant: adaptation, seed 1032
- Mechanism: propose slot -> anything later? -> switch provider -> seat-type request unsupported
- Changes: restaurant/booth/bar seating -> dentist chair preferences (unsupported); no second location exists
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [reply-must-match @turn 4] chair preference is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?"

1. **Customer:** Can I make an appointment please?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A cleaning, Thursday night at 8pm. Anything open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Anything after 8pm? What about 8:30 or 9pm?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"20:00"}`
4. **Customer:** OK what about another dental office across town?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","time":"20:00","service":"Dental consultation / basic exam"}`
5. **Customer:** Thursday 4pm here works. Can I get a window chair too?
   **Receptionist:** 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
6. **Customer:** Tanya Rolle 242-555-0141
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Tanya Rolle","phone":"+12425550141","service":"Dental consultation / basic exam"}`
7. **Customer:** yes, all good
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Tanya Rolle","phone":"+12425550141","service":"Dental consultation / basic exam"}`

### TM-0b5b803f — FAIL (dev-rule-based fallback (free))

- Source: dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2), variant: adaptation, seed 1033
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}) not found in order
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And the best phone number to reach you?"

1. **Customer:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **Customer:** yes
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Friday","time":"10:00"}`
3. **Customer:** Actually could we do Monday at 11am instead?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Monday","time":"11:00"}`
4. **Customer:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Monday","time":"11:00"}`
5. **Customer:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Routine cleaning on Monday, October 12 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550142","service":"Routine cleaning","date":"Monday","time":"11:00","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, October 12 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-1159607c — FAIL (dev-rule-based fallback (free))

- Source: dlg-1159607c-85d2-4899-bb3b-9db2ff0933a4 (restaurant-table-2), variant: adaptation, seed 1034
- Mechanism: off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered'
- Changes: jambalaya/Dr. Pepper/menu questions -> out-of-scope asks (food, drinks); no order is created
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}) not found in order
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And the best phone number to reach you?"

1. **Customer:** Hi, I'd like to book for tonight at 8pm. Do you serve jambalaya? Do you have Dr. Pepper?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"20:00"}`
2. **Customer:** Actually I'd like to book a consultation Wednesday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","time":"16:00","service":"Dental consultation / basic exam","date":"Wednesday"}`
3. **Customer:** yes
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","time":"16:00","service":"Dental consultation / basic exam","date":"Wednesday"}`
4. **Customer:** Could we order two miso soups too?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","time":"16:00","service":"Dental consultation / basic exam","date":"Wednesday"}`
5. **Customer:** Evan Pratt 242-555-0143
   **Receptionist:** I have you down for Dental consultation / basic exam on Wednesday, October 14 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550143","time":"16:00","service":"Dental consultation / basic exam","date":"Wednesday","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Wednesday, October 14 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-3660ae8b — FAIL (dev-rule-based fallback (free))

- Source: dlg-3660ae8b-6892-49a4-8e81-7617ed38127a (restaurant-table-3), variant: adaptation, seed 1035
- Mechanism: repeated alternative probing at one time slot, then customer gives up (abandon with no booking)
- Changes: indoor/outdoor seating probes -> chair/room preferences; customer ends with no booking
- Expected: outcome `abandoned`, bookings 0
- Actual outcome: unresolved
- ❌ [resolution] expected outcome "abandoned", actual "unresolved"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Could I get your name and phone number?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Could I get your name and phone number?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And the best phone number to reach you?"

1. **Customer:** I'd like an appointment for 12:00pm today
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"2026-10-09","time":"12:00"}`
2. **Customer:** a cleaning, just me
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-10-09","time":"12:00","service":"Routine cleaning"}`
3. **Customer:** Is there anything after that? When is the next availability?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-10-09","time":"12:00","service":"Routine cleaning"}`
4. **Customer:** Is there an outdoor room available at 12:00?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","date":"2026-10-09","time":"12:00","service":"Routine cleaning"}`
5. **Customer:** What about Thursday at 12pm?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"What About At ?","date":"2026-10-09","time":"12:00","service":"Routine cleaning"}`
6. **Customer:** Ok. I will book next time.
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"What About At ?","date":"2026-10-09","time":"12:00","service":"Routine cleaning"}`

### TM-590f7375 — FAIL (dev-rule-based fallback (free))

- Source: dlg-590f7375-238c-49d2-b3b8-7e537d210d4d (restaurant-table-1), variant: adaptation, seed 1036
- Mechanism: criteria search (cuisine, budget, rating) + hotel location question + group split
- Changes: cuisine/budget/rating criteria -> price/quality filter requests that cannot be served; 'table for six/two tables' -> several patients: one booking per patient, no group booking invented
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "I have you down for Dental consultation / basic exam on Monday, October 12 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."
- ❌ [detail-loss @turn 3] date changed from "Monday" to undefined without a customer correction
- ❌ [reply-must-match @turn 1] cheapest configured service is the B$75 consultation: reply did not match /B\$\s?75/ — "And what time? (please include am/pm)"
- ❌ [reply-must-match @turn 2] ratings are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "And what time? (please include am/pm)"

1. **Customer:** I'm looking to book dental care for my family on Monday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday"}`
2. **Customer:** I want the cheapest option under B$100
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday"}`
3. **Customer:** Does the clinic have at least four stars on Google? What building is it in?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Monday"}`
4. **Customer:** Can you book six people at once at 8pm?
   **Receptionist:** 8:00 PM on Monday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
5. **Customer:** Ok then a consultation for me, Monday 10am. Ruth Sims 242-555-0144
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","phone":"+12425550144","service":"Dental consultation / basic exam","date":"Monday","time":"10:00"}`
6. **Customer:** yes
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, October 12 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550144","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`
7. **Customer:** Does the clinic have a dress code?
   **Receptionist:** I have you down for Dental consultation / basic exam on Monday, October 12 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550144","service":"Dental consultation / basic exam","date":"Monday","time":"10:00","pendingAction":"confirm_booking"}`

### TM-5e0469c8 — FAIL (dev-rule-based fallback (free))

- Source: dlg-5e0469c8-0968-40ad-8c22-6c118afaa781 (restaurant-table-2), variant: adaptation, seed 1037
- Mechanism: alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation
- Changes: gluten-free/parking/outdoor -> unconfigured facts; party size 4 -> 6 change is not a clinic concept
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}) not found in order
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [reply-must-match @turn 3] waiting area / parking are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "And the best phone number to reach you?"

1. **Customer:** I'd like to find a dentist for a filling
   **Receptionist:** Yes — Basic filling is B$175 and takes about 45 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","pendingAction":"confirm_service"}`
2. **Customer:** Let's try Thursday at 9am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Thursday","time":"09:00"}`
3. **Customer:** I'd like 10am then
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"I'd Like Then","date":"Thursday","time":"09:00"}`
4. **Customer:** Is there outside seating or a waiting area? Is there parking?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"I'd Like Then","date":"Thursday","time":"09:00"}`
5. **Customer:** Great, please book the filling for 10am Thursday
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"I'd Like Then","date":"Thursday","time":"09:00"}`
6. **Customer:** Andre Cox 242-555-0145
   **Receptionist:** I have you down for Basic filling on Thursday, October 15 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Basic filling","name":"I'd Like Then","phone":"+12425550145","date":"Thursday","time":"09:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, October 15 at 9:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-92fb5414 — FAIL (dev-rule-based fallback (free))

- Source: dlg-92fb5414-3316-4340-b2a2-18a3c9d43bc8 (restaurant-table-3), variant: adaptation, seed 1038
- Mechanism: customer gives up after repeated slot misses (abandon without booking)
- Changes: restaurant search near me -> no other clinics exist; abandons after slot refusals
- Expected: outcome `abandoned`, bookings 0
- Actual outcome: abandoned
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** Hey, can I get a cleaning at a dentist near me tonight?
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** Friday at 7pm then
   **Receptionist:** 7:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Just me. Could I get a chair near the window?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** Do you have anything at 8pm?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"20:00"}`
5. **Customer:** What about 9pm?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"20:00"}`
6. **Customer:** Okay, never mind about the appointment then.
   **Receptionist:** No problem — I won't continue with that. Let me know if you'd like to start something else.
   _state:_ `{}`
7. **Customer:** It's alright. Thank you for trying.
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-c4801b6b — FAIL (dev-rule-based fallback (free))

- Source: dlg-c4801b6b-3d1a-43b8-97e1-02be355e646d (restaurant-table-3), variant: adaptation, seed 1039
- Mechanism: frustration after failed attempts, then withdrawal
- Changes: steak/seafood -> cleaning; 'lost my appetite' -> frustrated withdrawal
- Expected: outcome `abandoned`, bookings 0
- Actual outcome: unresolved
- ❌ [resolution] expected outcome "abandoned", actual "unresolved"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** Hello, I want a cleaning tonight at 7pm
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** What about 6pm?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"18:00"}`
3. **Customer:** Ok, let's skip that. Either 6 or 7pm would work.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"18:00"}`
4. **Customer:** Oh no, how frustrating!!!
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"18:00"}`
5. **Customer:** No, I think I'm just going to sit this one out.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"18:00"}`
6. **Customer:** No, not right now, I've got to go, bye
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"18:00"}`

### TM-0341f269 — PASS (dev-rule-based fallback (free))

- Source: dlg-0341f269-5d30-4ec7-bd67-672f8a715f89 (restaurant-table-2), variant: adaptation, seed 1040
- Mechanism: name two venues in sequence; party-size and day given; 'change my reservation to a different place'
- Changes: 'different restaurant' -> different service; slot corrected to within hours
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"10:00","name":"Opal Day","phone":"+12425550146"}
- Actual outcome: completed

1. **Customer:** Hi, I would like to make an appointment.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** For a consultation, for 2 people
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingBareTime":"2:0"}`
3. **Customer:** I want 8pm on Saturday.
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
4. **Customer:** Ok, what about 7pm?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"19:00"}`
5. **Customer:** Ok, I would like to change it to a cleaning instead, Friday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","time":"10:00","date":"Friday"}`
6. **Customer:** Opal Day 242-555-0146
   **Receptionist:** I have you down for Routine cleaning on Friday, October 16 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Opal Day","phone":"+12425550146","service":"Routine cleaning","time":"10:00","date":"Friday","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, October 16 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0907b949 — FAIL (dev-rule-based fallback (free))

- Source: dlg-0907b949-f00c-4595-8c1a-8978665bf1b6 (restaurant-table-2), variant: adaptation, seed 1041
- Mechanism: tonight slot, then 7?, then back to original time, high-chair special request added late
- Changes: high-chair request -> child-seating/other special request; unconfigured accommodations not promised
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Zane Moss","phone":"+12425550147"}
- Actual outcome: completed
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Could I get your name and phone number?"
- ❌ [reply-must-match @turn 5] child-seat accommodations are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Could I get your name and phone number?"

1. **Customer:** I'd like an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** Nassau
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Thursday at 8pm
   **Receptionist:** 8:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** Is there anything at 7?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingBareTime":"7:0"}`
5. **Customer:** Thursday 4pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
6. **Customer:** Ok, I forgot to ask: my child needs a booster seat in the chair
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
7. **Customer:** Zane Moss 242-555-0147
   **Receptionist:** I have you down for Routine cleaning on Thursday, October 15 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Zane Moss","phone":"+12425550147","service":"Routine cleaning","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
8. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, October 15 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0ea74929 — FAIL (dev-rule-based fallback (free))

- Source: dlg-0ea74929-d1b0-4c2a-8465-6fb65bf8a389 (restaurant-table-2), variant: adaptation, seed 1042
- Mechanism: seat preference change, venue switch, tasting-menu / head-chef questions, final time change
- Changes: table by window/fireplace -> unsupported room preferences; menu/chef questions -> unconfigured clinic info
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}) not found in order
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [reply-must-match @turn 4] named staff / specials are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "And the best phone number to reach you?"

1. **Customer:** I'd like to book a cleaning for two
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** Friday 4pm please. Ask for the window chair.
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"16:00"}`
3. **Customer:** yes
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Friday","time":"16:00"}`
4. **Customer:** Yes, but I'd like the chair near the outdoor fireplace instead.
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Friday","time":"16:00"}`
5. **Customer:** Is Dr. Nia doing it? Are there any specials that day?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Friday","time":"16:00"}`
6. **Customer:** Let's make it 3pm instead
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Friday","time":"15:00"}`
7. **Customer:** Quinn Ali 242-555-0148
   **Receptionist:** I have you down for Routine cleaning on Friday, October 16 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550148","service":"Routine cleaning","date":"Friday","time":"15:00","pendingAction":"confirm_booking"}`
8. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday, October 16 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0f57a901 — FAIL (dev-rule-based fallback (free))

- Source: dlg-0f57a901-2757-464f-9613-132bff3ead34 (restaurant-table-2), variant: adaptation, seed 1043
- Mechanism: headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises
- Changes: water view/sunset -> unsupported amenity; date 24th->23rd -> weekday swap; multiple venue hops -> multiple service hops
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}) not found in order
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [reply-must-match @turn 1] views are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "What day and time works best for you?"

1. **Customer:** Please book me a filling Friday 6pm
   **Receptionist:** 6:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **Customer:** Make sure the room has a stunning view of the water
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **Customer:** Oh I forgot, include my cousin, so that makes two of us
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
4. **Customer:** Let me know ASAP please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
5. **Customer:** Try Thursday
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Try","service":"Basic filling","date":"Thursday"}`
6. **Customer:** Darn. What about a classy modern clinic instead?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","name":"Try","service":"Basic filling","date":"Thursday"}`
7. **Customer:** Fine, Thursday 3pm here then. Isla Munn 242-555-0149
   **Receptionist:** I have you down for Basic filling on Thursday, October 15 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Try","phone":"+12425550149","service":"Basic filling","date":"Thursday","time":"15:00","pendingAction":"confirm_booking"}`
8. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Basic filling on Thursday, October 15 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-209856e2 — FAIL (dev-rule-based fallback (free))

- Source: dlg-209856e2-3ec2-464c-bbc5-f6013d138ebb (restaurant-table-1), variant: adaptation, seed 1044
- Mechanism: assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter
- Changes: recall of a stored restaurant -> recall of a stored dentist/service; no memory exists, must not invent
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I'm feeling like I should get my teeth checked!
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** What's that treatment I told you to remember I liked?
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Will you book me tomorrow night at 8 for a cleaning?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Wow, how did you do that so quickly?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Who's your daddy?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** ok book a cleaning Tuesday at 4pm. Cole Nash 242-555-0150
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-4d9d8a2b — FAIL (dev-rule-based fallback (free))

- Source: dlg-4d9d8a2b-4e6d-4923-b8a5-bc8fd4037286 (restaurant-table-2), variant: adaptation, seed 1045
- Mechanism: special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details
- Changes: anniversary cake -> birthday cake request (unsupported); party of 8 -> not a clinic concept; patio -> unsupported
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Could I get your name and phone number?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [reply-must-match @turn 6] patio is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "And the best phone number to reach you?"

1. **Customer:** Hi, I'd like to book a filling
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Basic filling"}`
3. **Customer:** Friday 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
4. **Customer:** Actually, can we do 4:30?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Basic filling","date":"Friday","time":"16:00"}`
5. **Customer:** Let's make it 4pm after all.
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Let's Make It After All.","service":"Basic filling","date":"Friday","time":"16:00"}`
6. **Customer:** It's my husband's birthday, can you bring out a cake at a certain time?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Let's Make It After All.","service":"Basic filling","date":"Friday","time":"16:00"}`
7. **Customer:** Is there outdoor space like a patio? I'd like to book on the patio.
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Let's Make It After All.","service":"Basic filling","date":"Friday","time":"16:00"}`
8. **Customer:** Joy Hall 242-555-0151
   **Receptionist:** I have you down for Basic filling on Friday, October 16 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Let's Make It After All.","phone":"+12425550151","service":"Basic filling","date":"Friday","time":"16:00","pendingAction":"confirm_booking"}`
9. **Customer:** No, that sounds right.
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"intent":"book_appointment","name":"Let's Make It After All.","phone":"+12425550151","service":"Basic filling","justDeclined":true,"date":"Friday","time":"16:00"}`

### TM-55ab43fe — FAIL (dev-rule-based fallback (free))

- Source: dlg-55ab43fe-1b96-4b17-9aa3-6d15cf933780 (restaurant-table-2), variant: adaptation, seed 1046
- Mechanism: spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation
- Changes: spelling correction must be stored as the final name, not the letters
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day and time works best for you?"

1. **Customer:** Hi there, I'm looking to reserve a cleaning
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** Todd Choiniere. It's spelled C-h-o-i-n-i-e-r-e.
   **Receptionist:** Just to confirm — would you like to book Routine cleaning? (yes/no)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
3. **Customer:** Is Saturday available?
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Is Available?","date":"Saturday"}`
4. **Customer:** Hmm okay. What about that next Monday around 9am?
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Is Available?"}`
5. **Customer:** 242-555-0152
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Is Available?","phone":"+12425550152"}`
6. **Customer:** yes, that's correct
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Is Available?","phone":"+12425550152"}`

### TM-56325402 — FAIL (dev-rule-based fallback (free))

- Source: dlg-56325402-8eb3-4765-9a4a-94eee0d0ab41 (restaurant-table-1), variant: adaptation, seed 1047
- Mechanism: recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start
- Changes: 'old-school French restaurant with really good wine' -> 'recommend a service'; no clinical advice invented
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}) not found in order

1. **Customer:** Hello, I'm looking for a good dental service, what do you recommend?
   **Receptionist:** We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Want details on one, or should I help you book?
   _state:_ `{}`
2. **Customer:** Which one is really good?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
3. **Customer:** Excellent, I'll try the cleaning.
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
4. **Customer:** Thursday around 4pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00"}`
5. **Customer:** What about 3pm?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"What About ?","date":"Thursday","time":"16:00"}`
6. **Customer:** Perfect, I'll take that. Rhea Dunn 242-555-0153
   **Receptionist:** I have you down for Routine cleaning on Thursday, October 15 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"What About ?","phone":"+12425550153","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Thursday, October 15 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-65958f69-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-65958f69-c7c0-4dd9-931e-eb0497091f50 (auto-repair-appt-1), variant: typo, seed 6000, derived from TM-65958f69
- Mechanism: same-day urgency + add-on detail + mid-flow detail correction + name/phone in one message
- Changes: car/shop -> dental filling at Bahamas Dental Service; 'today' replaced by a configured weekday (clock-independent); second complaint becomes a free-text note; no second service invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→filing, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"15:00","name":"Alicia Moss","phone":"+12425550111"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hi, can I get a filing this week? Any time before you close.
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time).
   _state:_ `{}`
2. **Customer:** yes
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
3. **Customer:** Wendesday 3pm
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
4. **Customer:** actually it's the upper left tooth, not the right
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Now that you mention it another tooth is sensitive too, note that please
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Alicia Moss 242-555-0111
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-929b59a3-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1), variant: typo, seed 6001, derived from TM-929b59a3
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 8] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 4] 6pm is after the 5pm close and must not be accepted: reply did not match /outside|open|hours|9/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I'd like to schedule a cleaing
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Brent Cole
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** 242-555-0112
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112"}`
5. **Customer:** Thrusday 6pm
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","phone":"+12425550112","time":"18:00"}`
6. **Customer:** Can I come in at 4pm then?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","phone":"+12425550112","time":"18:00"}`
7. **Customer:** How much will the cleaing be?
   **Receptionist:** Here's our pricing: Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","phone":"+12425550112","time":"18:00"}`
8. **Customer:** Okay, that's fine.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","phone":"+12425550112","time":"18:00"}`
9. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","phone":"+12425550112","time":"18:00"}`

### TM-e32859b3-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-e32859b3-88ca-4617-b7ce-1bc9cd4d42cb (auto-repair-appt-1), variant: typo, seed 6003, derived from TM-e32859b3
- Mechanism: service + hours question, day-of-week preference, declining an upsell, graceful close
- Changes: oil change/tune-up -> consultation + cleaning request (one service per booking); 'what days are you open' answered from configured hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→conslutation
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Dario Finn","phone":"+12425550114"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** Hi, can I schedule a dental conslutation?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **Customer:** No, I haven't been before.
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **Customer:** What days are you open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
4. **Customer:** Okay. I can do any time on Mondays actually.
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
5. **Customer:** Morning would be best, 10am
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"10:00"}`
6. **Customer:** Dario Finn 242-555-0114
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","time":"10:00"}`
7. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","time":"10:00"}`
8. **Customer:** No that's it, thanks!
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","name":"Dario Finn","phone":"+12425550114","service":"Dental consultation / basic exam","time":"10:00"}`

### TM-5cb6cabb-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1), variant: typo, seed 6004, derived from TM-5cb6cabb
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 4] configured price: reply did not match /B\$\s?125/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I need to book a cleaing please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Tuesdya 8am
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","time":"08:00"}`
4. **Customer:** Are there other times available?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","time":"08:00"}`
5. **Customer:** 9am works. What will it cost?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","time":"08:00"}`
6. **Customer:** Erin Hall 242-555-0115
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","phone":"+12425550115","time":"08:00"}`
7. **Customer:** Great! Please go ahead
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","phone":"+12425550115","time":"08:00"}`
8. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","phone":"+12425550115","time":"08:00"}`

### TM-5d1a2f2e-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-5d1a2f2e-63eb-45a4-b18e-71035ef62e8e (auto-repair-appt-1), variant: typo, seed 6005, derived from TM-5d1a2f2e
- Mechanism: booking 'for the regular provider', multi-item request, fee question, post-confirmation follow-up
- Changes: tune-up + oil change + stalling -> filling and a cleaning request; inspection fee -> B$75 consultation price only; no invented fee; multiple services: one is booked, the other is flagged, nothing is silently dropped; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, filling→fillign
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"09:00","name":"Frank Gill","phone":"+12425550116"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I want an appointment at my regular dentist
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** I need a fillign, and a cleanign if possible
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Friday 8am
   **Receptionist:** 8:00 AM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** ok then 9am Friday
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"09:00"}`
5. **Customer:** Frank Gill, 242-555-0116
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`
7. **Customer:** If it changes I'll call back.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Frank Gill","phone":"+12425550116","date":"Friday","time":"09:00"}`

### TM-66c6b5b1-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1), variant: typo, seed 6006, derived from TM-66c6b5b1
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hi, I'd like a claening
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** I need it done before Wendesday because I'm travelling.
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Monday 10am
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** It's for my wife, Janet Smith
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** 242-555-0117
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** How much will it cost?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** Sounds great, thank you
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-87484a2b-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-87484a2b-afe9-4d39-8b24-6118576737a9 (auto-repair-appt-1), variant: typo, seed 6007, derived from TM-87484a2b
- Mechanism: request is narrowed after a list of problems; customer rejects the first offered time as too late
- Changes: multi-problem car visit -> customer lists three dental concerns then narrows to a filling; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, filling→fillign
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"11:00","name":"Lola Abbott","phone":"+12425550118"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Hello I need an appointment please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** I have a cavity, my gums bleed and I'd like a cleaing
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Actually I just want the fillign done first
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** Name is Lola Abbott, 242-555-0118
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Name Is Lola Abbott","phone":"+12425550118"}`
5. **Customer:** Next Thursday is too far, what about Tuesday 11am?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Name Is Lola Abbott","phone":"+12425550118","date":"2026-10-15","time":"11:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Name Is Lola Abbott","phone":"+12425550118","date":"2026-10-15","time":"11:00"}`

### TM-a8533b60-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1), variant: typo, seed 6008, derived from TM-a8533b60
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I need an apointment Monday morning
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** A cleanign
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** John Smith
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** 2425550119
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** yes that works, 9:30
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** ok please do
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-b2e78e29-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-b2e78e29-bb98-4a4b-aa72-1dc4296cf2cc (auto-repair-appt-1), variant: typo, seed 6009, derived from TM-b2e78e29
- Mechanism: name interrupted/corrected, payment + rental + transport questions with unconfigured answers
- Changes: 'do you accept checks' / 'rental place nearby' -> unconfigured facts must be deferred; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Friday→Fridya
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Matthew Ross","phone":"+12425550120"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Matthew Ross","phone":"+12425550120"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hi, this is Matt, I need a fillign
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Fridya 10am
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Oh sorry, it's Matthew Ross, 242-555-0120
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Do you accept checks?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Is there parking nearby?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-da2f3e45-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-da2f3e45-5d76-4e15-8ae9-d7cafe2873b7 (auto-repair-appt-1), variant: typo, seed 6010, derived from TM-da2f3e45
- Mechanism: preferred day, duration question, directions request
- Changes: oil change -> cleaning; directions answered from the configured address only; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"10:00","name":"Gina Hart","phone":"+12425550121"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"10:00","name":"Gina Hart","phone":"+12425550121"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 4] cleaning duration is 60 minutes: reply did not match /60/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 5] address only; no invented turn-by-turn directions: reply did not match /Shirley/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I need to schedule a cleaing
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Tuesdya 10am
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","time":"10:00"}`
4. **Customer:** Gina Hart, 242-555-0121
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","phone":"+12425550121","time":"10:00"}`
5. **Customer:** How long will it take?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","phone":"+12425550121","time":"10:00"}`
6. **Customer:** Can you give me directions?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","phone":"+12425550121","time":"10:00"}`
7. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Tuesdya","phone":"+12425550121","time":"10:00"}`

### TM-db02658a-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-db02658a-e254-4b8a-949e-7cb7ca04800c (auto-repair-appt-1), variant: typo, seed 6011, derived from TM-db02658a
- Mechanism: price first, then book; joking aside; add-on symptom raised after contact details
- Changes: oil change price query -> cleaning price query; no source prices; nail in tire -> sudden tooth sensitivity (note only); address joke ignored safely; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, cleaning→cleanign, Wednesday→Wednsday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"10:00","name":"Hugh Ince","phone":"+12425550122"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"10:00","name":"Hugh Ince","phone":"+12425550122"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** How much is a cleanign?
   **Receptionist:** Here's our pricing: Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950).
   _state:_ `{}`
2. **Customer:** ok let's book the cleanign Wednsday at 10am
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"10:00"}`
3. **Customer:** Hugh Ince 242-555-0122
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","time":"10:00"}`
4. **Customer:** Just kidding about the address, you don't need it
   **Receptionist:** We're located at Shirley St., Nassau, The Bahamas. Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","time":"10:00"}`
5. **Customer:** Actually one of my teeth has been sensitive, add that to the visit
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","time":"10:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Hugh Ince","phone":"+12425550122","time":"10:00"}`

### TM-136f95ec-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-136f95ec-e309-4246-a6d9-2b4e8beaba7f (auto-repair-appt-1), variant: typo, seed 6012, derived from TM-136f95ec
- Mechanism: terse fragments incl. unsupported size/model word, time of day only ('morning'), price after contact
- Changes: car model/size answers -> no-op noise ('XL') that must not corrupt state; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Thursday→Thurday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"10:00","name":"Jon Madden","phone":"+12425550123"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Hi I would like to book a claening
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** XL
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** Morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
5. **Customer:** 10am Thurday
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thurday","time":"10:00"}`
6. **Customer:** Jon Madden
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thurday","time":"10:00"}`
7. **Customer:** 242-555-0123
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thurday","phone":"+12425550123","time":"10:00"}`
8. **Customer:** Thanks, can you tell me how much it will cost?
   **Receptionist:** Here's our pricing: Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thurday","phone":"+12425550123","time":"10:00"}`
9. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thurday","phone":"+12425550123","time":"10:00"}`

### TM-1671146d-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-1671146d-10be-460d-9f3a-ecb758f8078c (auto-repair-appt-1), variant: typo, seed 6013, derived from TM-1671146d
- Mechanism: multi-turn availability negotiation: day refused, 'too early', alternative accepted
- Changes: busy-Thursday and 'too early' negotiation preserved; tire PSI request removed (unsupported); typo variant: content-word misspellings (see typoEdits)
- Typo edits: Thursday→Thrusday, Thursday→Thrusday, Friday→Fridya, Friday→Fridya, Friday→Fridya
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"13:00","name":"Ian Poole","phone":"+12425550124"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 8] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** I need a dental exam
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **Customer:** Thrusday 9am
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Thrusday","time":"09:00"}`
4. **Customer:** Sorry, no. I forgot, my schedule is busy on Thrusday.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Thrusday","time":"09:00"}`
5. **Customer:** Fridya please
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Thrusday","time":"09:00"}`
6. **Customer:** That's too early. Any other time on Fridya?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Thrusday","time":"09:00"}`
7. **Customer:** Fridya 1pm works
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Thrusday","time":"09:00"}`
8. **Customer:** Ian Poole 242-555-0124
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Thrusday","phone":"+12425550124","time":"09:00"}`
9. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Thrusday","phone":"+12425550124","time":"09:00"}`

### TM-29f37e32-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-29f37e32-23e0-4f19-aab7-916a40861608 (auto-repair-appt-1), variant: typo, seed 6014, derived from TM-29f37e32
- Mechanism: urgency + successive earlier-time pushes; booking must respect business hours
- Changes: 7am/8am requests are outside configured hours (opens 9); axle/pulling symptom -> mild jaw ache (not an emergency); typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Tuesday→Tuesdya, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Tuesday","preferredTime":"09:00","name":"Jake Bauers","phone":"+12425550125"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [reply-must-match @turn 3] 7am rejected: reply did not match /open|hours|9/ — "Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly."
- ❌ [reply-must-match @turn 4] 8am rejected: reply did not match /open|hours|9/ — "Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly."

1. **Customer:** I want a consultaton, my jaw has been aching
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Jake Bauers, 242-555-0125
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** This is urgent. Can I come at 7am Tuesdya?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** What about 8am?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Nothing earlier than that?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Oh ok, then 9am Tuesdya.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-3d00c7a6-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1), variant: typo, seed 6015, derived from TM-3d00c7a6
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Wednesday→Wednsday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [reply-must-match @turn 5] tire rotation is not a clinic service: reply did not match /can't|cannot|don't|do not|not (something|offer)|dental|services|we offer/ — "Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly."

1. **Customer:** I need a claening, tomorrow or later today if you can
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Oh no, I have a meeting at 10am. What about earlier? Wednsday 9am?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** That is perfect
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Let me think.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** I also need my tires rotated
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Maggie Rivera
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** yes. 242-555-0126
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
9. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-4b9c7860-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-4b9c7860-5de3-40ea-a210-57ecbca80427 (auto-repair-appt-1), variant: typo, seed 6016, derived from TM-4b9c7860
- Mechanism: drop-off with shuttle question, 'record is under my personal account' remark, decline of extra help
- Changes: shuttle -> unconfigured amenity; must be deferred, never confirmed; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, appointment→apointment
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Igor Horne","phone":"+12425550127"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hello, I want to make an apointment for a cleaing
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Tuesday morning, 9am
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Igor Horne, 242-555-0127. Also my record is under my personal number, please note it. Do you offer a shuttle?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** No thank you, I'll arrange it myself
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-4ebc6c62-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-4ebc6c62-8065-46ec-ba02-0766a86bcb8a (auto-repair-appt-1), variant: typo, seed 6017, derived from TM-4ebc6c62
- Mechanism: assistant-memory presumptions ('the one I went to last time'), earlier-than-offered push, contact preference
- Changes: 'the shop I went to last time' -> 'same as my last visit': no history exists, must not invent one; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"14:00","name":"Kara Lowe","phone":"+12425550128"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Can you book me for the same thing as last time?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A cleanign, I guess
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** Thrusday 2pm
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","time":"14:00"}`
5. **Customer:** Name is Kara Lowe, use 242-555-0128 not my other number
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","phone":"+12425550128","time":"14:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Thrusday","phone":"+12425550128","time":"14:00"}`

### TM-53cfb4bd-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-53cfb4bd-089b-4d88-9497-e928a7d4eb8c (auto-repair-appt-1), variant: typo, seed 6018, derived from TM-53cfb4bd
- Mechanism: weekend request against weekday-only hours; customer relents to a valid weekday morning
- Changes: Saturday March 30 -> Saturday (closed per configured hours); 'ask Jim' -> no staff names; ask for a morning slot; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, cleaning→claening, Friday→Firday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"09:00","name":"Nia Vance","phone":"+12425550129"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [reply-must-match @turn 2] clinic is closed Saturday: reply did not match /closed|Monday|weekday|open/ — "Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly."

1. **Customer:** Hi, I'd like a claening but I'm busy this week, can we try Saturday?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Saturday morning 9am
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** 11am won't work, I have brunch. Can you do 9?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** OK what about Firday 9am then?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Nia Vance, 242-555-0129
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** How much is the claening?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-60cceb98-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1), variant: typo, seed 6019, derived from TM-60cceb98
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Tuesday→Tusday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I'd like a cleaing next week
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Tusday 12:30pm
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Bob Smythe, 242-555-0130
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-70bc0cb6-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-70bc0cb6-d391-4f7e-bf11-bcc65e3363f3 (auto-repair-appt-1), variant: typo, seed 6020, derived from TM-70bc0cb6
- Mechanism: vague problem, wrong-vehicle correction, same-day pressure, repair-duration question
- Changes: vehicle correction (Ram vs Corolla) -> service correction (filling vs cleaning); 'how long will it take to fix' -> must give only configured procedure duration; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, filling→filing
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Thursday","preferredTime":"16:00","name":"Suzy Baker","phone":"+12425550131"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hey, something's wrong with my tooth, can I come in sometime soon?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Suzy Baker, 242-555-0131
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Sorry, I meant a filing, not a cleanign
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Is there anything this afternoon? Thursday 4pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** How long will it take if there's a problem?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** ok that works
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-71cbe988-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-71cbe988-8a26-4217-b466-db33a1840d46 (auto-repair-appt-1), variant: typo, seed 6021, derived from TM-71cbe988
- Mechanism: customer repeats name/phone after an after-work time change
- Changes: duplicate contact message must not duplicate or corrupt state; evening time clipped to 5pm close; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, consultation→conslutation
- Expected: outcome `unresolved`, bookings 0
- Actual outcome: unresolved
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 3] 5pm start for a 30-minute consultation passes the 5pm close; must not silently accept a slot that ends after closing: reply did not match /5|hours|open|close|latest|end/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I'd like to book a general check-up and a fillign
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A conslutation first
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Tomorrow morning at 10 am would be ideal
   **Receptionist:** We're closed on Saturday, October 10. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** Actually I'd prefer after work, do you have 5pm?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"17:00"}`
5. **Customer:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","time":"17:00"}`
6. **Customer:** Sure, my name is Betty Begg and my number is 242 555 0132
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","time":"17:00"}`
7. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Betty Begg","phone":"+12425550132","time":"17:00"}`

### TM-73b0e503-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-73b0e503-42ec-49e8-839a-1104907f686e (auto-repair-appt-1), variant: typo, seed 6022, derived from TM-73b0e503
- Mechanism: pain symptom + immediate availability push + evening fallback accepted reluctantly
- Changes: clutch failing -> loose crown (urgent but not an emergency); 'this evening' is after hours and must not be booked; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"15:00","name":"Mina Shaw","phone":"+12425550133"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hello, I need to get my tooth looked at, a crown came loose
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Mina Shaw, 242-555-0133
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** It's a consultaton. Do you have anything today around 2?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** How about this evening?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Okay, Wendesday 3pm then
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-7a8274ab-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-7a8274ab-8a70-44f3-80df-197601afc7d6 (auto-repair-appt-1), variant: typo, seed 6023, derived from TM-7a8274ab
- Mechanism: customer asks the assistant to use an 'online tool', pushes same-day then accepts later time
- Changes: 'online tool' is this chat itself; assistant must not claim to call or text third parties; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Arnold Benjamin","phone":"+12425550134"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hi, can you set up an appoitment for me?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** A cleanign
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** I'd like to get it done today if possible
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** How's 4:30pm? Thursday
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** What about 5:30pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Arnold Benjamin, 242-555-0134
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** Thursday 4pm is fine then
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
9. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-8e3522af-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-8e3522af-9e99-405b-baa4-737eefbd2c4f (auto-repair-appt-1), variant: typo, seed 6024, derived from TM-8e3522af
- Mechanism: frustrated repeated same-day demands, price asked twice, asks assistant to arrange an unrelated third-party service
- Changes: window leak/rain -> chipped tooth; 'rental car' request -> unsupported third-party task; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→filing, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Wednesday","preferredTime":"14:00","name":"Pat Cruz","phone":"+12425550135"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [reply-must-match @turn 3] configured price: reply did not match /B\$\s?175/ — "Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly."

1. **Customer:** I need a filing today, my tooth chipped
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Pat Cruz, 242-555-0135
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Is there no way we can have it done today? Nothing is making it change?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** How much was it going to be, you never said?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** This is ridiculous, I can't believe there's nothing today
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Fine, book Wendesday 2pm. Run it by me again first.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Okay, that's fine.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** Also please arrange a ride for me for tomorrow
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-92975e16-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-92975e16-5436-4179-9f4c-e680c623271e (auto-repair-appt-1), variant: typo, seed 6025, derived from TM-92975e16
- Mechanism: date negotiated across turns, fee question, add-on mid-flow, final read-back
- Changes: inspection fee -> consultation price; 'add oil change' -> add cleaning note, no silent drops; typo variant: content-word misspellings (see typoEdits)
- Typo edits: appointment→appoitment, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Friday","preferredTime":"09:00","name":"Lena Ford","phone":"+12425550136"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [reply-must-match @turn 4] configured price: reply did not match /B\$\s?75/ — "Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly."

1. **Customer:** Hello, I think I'm due for a check-up, can you set up an appoitment?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Yes that would be great.
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Thrusday morning before work would work best
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Friday 9am is fine then
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Can you ask what the exam fee is?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Lena Ford, 242-555-0136
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-9f67b33c-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-9f67b33c-4074-4acf-9b9d-17f69bc00073 (auto-repair-appt-1), variant: typo, seed 6026, derived from TM-9f67b33c
- Mechanism: multi-item request + fee-up-front question + loaner-vehicle offer (unsupported perk)
- Changes: loaner car -> unconfigured perk; must not accept or promise one; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Michael Gibson","phone":"+12425550137"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 3] up-front fee policy is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 5] perks are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Want details on one, or should I help you book? Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Hello, I'm calling to book an apointment
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** I'm Michael Gibson, 242-555-0137
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137"}`
3. **Customer:** A cleanign, and I also want something checked, a strange pain when I bite
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137"}`
4. **Customer:** Do you charge any fee up front?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137"}`
5. **Customer:** See if you can fit me in Monday at 9am
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137","date":"Monday","time":"09:00"}`
6. **Customer:** Do you offer a loaner or ride service?
   **Receptionist:** We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Want details on one, or should I help you book? Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137","date":"Monday","time":"09:00"}`
7. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"I'm Michael Gibson","phone":"+12425550137","date":"Monday","time":"09:00"}`

### TM-e0a60506-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-e0a60506-5c3f-4308-a716-34f02f27e273 (auto-repair-appt-1), variant: typo, seed 6027, derived from TM-e0a60506
- Mechanism: customer volunteers extra personal detail (home address) and 'urgent as soon as possible'
- Changes: street address volunteered -> not collected; must not be stored as name/phone; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Tuesday","preferredTime":"09:00","name":"Max Reed","phone":"+12425550138"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I need an appoitment please, my tooth has a loud ache, maybe I need a fillign
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Max Reed
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** My address is 12 Palm Ave, Nassau
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** 2425550138
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** It's urgent, as soon as possible. Tuesday 9am?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Please schedule it. What about the cost?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-003677eb-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-003677eb-20f8-4b1e-a396-c0f95a786543 (auto-repair-appt-1), variant: typo, seed 6028, derived from TM-003677eb
- Mechanism: driving customer, three requests at once, earliest-slot demand, then a late-time proposal that is invalid
- Changes: 4:45pm for a 60-minute cleaning ends after the 5pm close; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, filling→filing
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Henry James","phone":"+18885430099"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Henry James","phone":"+18885430099"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hey, I'm driving, set me up for a cleaing and a filing please
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** A cleaing first
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** It's pretty urgent. What's the earliest you have, Friday?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** I really need it today before my trip tomorrow
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** No that's too late. Could I get in at 4:45pm Friday?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Friday 3pm is fine, thanks
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Henry James, 888 543 0099
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-078a0f20-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1), variant: typo, seed 6030, derived from TM-078a0f20
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, appointment→apointment
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I need an apointment for a claening
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** yes
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Wednesday if possible
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Anything sooner than 3pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** oh well. book Wednesday 3pm then
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Megan Smith 242-555-0139
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes that's right
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** No thanks
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-17420eb9-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-17420eb9-65ab-46ae-9e6b-f0031d415ea7 (auto-repair-appt-1), variant: typo, seed 6031, derived from TM-17420eb9
- Mechanism: question the system cannot answer from configuration ('ask them what I've done in the past'), duration question
- Changes: service-history lookup is unavailable to the receptionist; must not invent history; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, cleaning→cleaing, filling→fillign
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"11:00","name":"Mike Jones","phone":"+12425550140"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 4] cleaning duration: reply did not match /60/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Can you make an appointment for me? I need a cleaing and a fillign
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A cleaing first. 242-555-0140 is my number, Mike Jones
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140"}`
3. **Customer:** Tuesday 11am
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","date":"Tuesday","time":"11:00"}`
4. **Customer:** I have no idea what I've had done before. Ask them what I've had in the past.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","date":"Tuesday","time":"11:00"}`
5. **Customer:** How long will it take?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","date":"Tuesday","time":"11:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550140","date":"Tuesday","time":"11:00"}`

### TM-1b47bb2b-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-1b47bb2b-61b1-46b2-879a-719e939cf2f5 (restaurant-table-2), variant: typo, seed 6032, derived from TM-1b47bb2b
- Mechanism: propose slot -> anything later? -> switch provider -> seat-type request unsupported
- Changes: restaurant/booth/bar seating -> dentist chair preferences (unsupported); no second location exists; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Tanya Rolle","phone":"+12425550141"}) not found in order
- ❌ [reply-must-match @turn 4] chair preference is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Could I get your name and phone number?"

1. **Customer:** Can I make an apointment please?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** A cleanign, Thursday night at 8pm. Anything open?
   **Receptionist:** We're open Monday–Friday, 9:00 AM–5:00 PM (local time).
   _state:_ `{}`
3. **Customer:** Anything after 8pm? What about 8:30 or 9pm?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
4. **Customer:** OK what about another dental office across town?
   **Receptionist:** Yes — Dental consultation / basic exam is B$75 and takes about 30 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","pendingAction":"confirm_service"}`
5. **Customer:** Thursday 4pm here works. Can I get a window chair too?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","date":"Thursday","time":"16:00"}`
6. **Customer:** Tanya Rolle 242-555-0141
   **Receptionist:** I have you down for Dental consultation / basic exam on Thursday, October 15 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","name":"Tanya Rolle","phone":"+12425550141","date":"Thursday","time":"16:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes, all good
   **Receptionist:** Perfect — I've captured your request for Dental consultation / basic exam on Thursday, October 15 at 4:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-0b5b803f-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2), variant: typo, seed 6033, derived from TM-0b5b803f
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, filling→fillign
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I'd like to book a claening for Friday at 10am
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"10:00"}`
2. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Friday","time":"10:00"}`
3. **Customer:** Actually could we do Monday at 11am instead?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday","time":"11:00"}`
4. **Customer:** Hm, could I go back to Friday 10am but make it a fillign?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday","time":"11:00"}`
5. **Customer:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550142","date":"Monday","time":"11:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","phone":"+12425550142","date":"Monday","time":"11:00"}`

### TM-1159607c-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-1159607c-85d2-4899-bb3b-9db2ff0933a4 (restaurant-table-2), variant: typo, seed 6034, derived from TM-1159607c
- Mechanism: off-topic menu questions, then pivot to a real booking; unsupported items must not be 'ordered'
- Changes: jambalaya/Dr. Pepper/menu questions -> out-of-scope asks (food, drinks); no order is created; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Wednesday→Wendesday
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Wednesday","preferredTime":"16:00","name":"Evan Pratt","phone":"+12425550143"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Hi, I'd like to book for tonight at 8pm. Do you serve jambalaya? Do you have Dr. Pepper?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"20:00"}`
2. **Customer:** Actually I'd like to book a consultaton Wendesday 4pm
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"16:00"}`
3. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"16:00"}`
4. **Customer:** Could we order two miso soups too?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"16:00"}`
5. **Customer:** Evan Pratt 242-555-0143
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Evan Pratt","phone":"+12425550143","time":"16:00"}`
6. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Evan Pratt","phone":"+12425550143","time":"16:00"}`

### TM-3660ae8b-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-3660ae8b-6892-49a4-8e81-7617ed38127a (restaurant-table-3), variant: typo, seed 6035, derived from TM-3660ae8b
- Mechanism: repeated alternative probing at one time slot, then customer gives up (abandon with no booking)
- Changes: indoor/outdoor seating probes -> chair/room preferences; customer ends with no booking; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `abandoned`, bookings 0
- Actual outcome: escalated
- ❌ [tool_safety] prohibited action "escalate" was executed
- ❌ [resolution] expected outcome "abandoned", actual "escalated"

1. **Customer:** I'd like an appoitment for 12:00pm today
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** a cleanign, just me
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Is there anything after that? When is the next availability?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Is there an outdoor room available at 12:00?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** What about Thursday at 12pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Ok. I will book next time.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-590f7375-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-590f7375-238c-49d2-b3b8-7e537d210d4d (restaurant-table-1), variant: typo, seed 6036, derived from TM-590f7375
- Mechanism: criteria search (cuisine, budget, rating) + hotel location question + group split
- Changes: cuisine/budget/rating criteria -> price/quality filter requests that cannot be served; 'table for six/two tables' -> several patients: one booking per patient, no group booking invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: consultation→consultaton, Monday→Mondya, Monday→Mondya
- Expected: outcome `completed`, bookings 1, action {"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Dental consultation / basic exam","preferredDate":"Monday","preferredTime":"10:00","name":"Ruth Sims","phone":"+12425550144"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "What day works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day works best for you?"
- ❌ [reply-must-match @turn 1] cheapest configured service is the B$75 consultation: reply did not match /B\$\s?75/ — "What day and time works best for you?"
- ❌ [reply-must-match @turn 2] ratings are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "What day and time works best for you?"
- ❌ [reply-must-match @turn 6] dress code is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "What day works best for you?"

1. **Customer:** I'm looking to book dental care for my family on Mondya
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
2. **Customer:** I want the cheapest option under B$100
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
3. **Customer:** Does the clinic have at least four stars on Google? What building is it in?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam"}`
4. **Customer:** Can you book six people at once at 8pm?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","service":"Dental consultation / basic exam","time":"20:00"}`
5. **Customer:** Ok then a consultaton for me, Mondya 10am. Ruth Sims 242-555-0144
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550144","service":"Dental consultation / basic exam","time":"20:00"}`
6. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550144","service":"Dental consultation / basic exam","time":"20:00"}`
7. **Customer:** Does the clinic have a dress code?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550144","service":"Dental consultation / basic exam","time":"20:00"}`

### TM-5e0469c8-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-5e0469c8-0968-40ad-8c22-6c118afaa781 (restaurant-table-2), variant: typo, seed 6037, derived from TM-5e0469c8
- Mechanism: alternate provider probing, outdoor/gluten-free/parking questions, headcount change at confirmation
- Changes: gluten-free/parking/outdoor -> unconfigured facts; party size 4 -> 6 change is not a clinic concept; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, filling→fillign, Thursday→Thrusday, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Thursday","preferredTime":"10:00","name":"Andre Cox","phone":"+12425550145"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I'd like to find a dentist for a fillign
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Let's try Thrusday at 9am
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** I'd like 10am then
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Is there outside seating or a waiting area? Is there parking?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Great, please book the fillign for 10am Thrusday
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Andre Cox 242-555-0145
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-92fb5414-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-92fb5414-3316-4340-b2a2-18a3c9d43bc8 (restaurant-table-3), variant: typo, seed 6038, derived from TM-92fb5414
- Mechanism: customer gives up after repeated slot misses (abandon without booking)
- Changes: restaurant search near me -> no other clinics exist; abandons after slot refusals; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→apointment
- Expected: outcome `abandoned`, bookings 0
- Actual outcome: escalated
- ❌ [resolution] expected outcome "abandoned", actual "escalated"

1. **Customer:** Hey, can I get a cleanign at a dentist near me tonight?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Friday at 7pm then
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Just me. Could I get a chair near the window?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Do you have anything at 8pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** What about 9pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Okay, never mind about the apointment then.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** It's alright. Thank you for trying.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-c4801b6b-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-c4801b6b-3d1a-43b8-97e1-02be355e646d (restaurant-table-3), variant: typo, seed 6039, derived from TM-c4801b6b
- Mechanism: frustration after failed attempts, then withdrawal
- Changes: steak/seafood -> cleaning; 'lost my appetite' -> frustrated withdrawal; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening
- Expected: outcome `abandoned`, bookings 0
- Actual outcome: escalated
- ❌ [resolution] expected outcome "abandoned", actual "escalated"

1. **Customer:** Hello, I want a claening tonight at 7pm
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** What about 6pm?
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Ok, let's skip that. Either 6 or 7pm would work.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Oh no, how frustrating!!!
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** No, I think I'm just going to sit this one out.
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** No, not right now, I've got to go, bye
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-0341f269-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-0341f269-5d30-4ec7-bd67-672f8a715f89 (restaurant-table-2), variant: typo, seed 6040, derived from TM-0341f269
- Mechanism: name two venues in sequence; party-size and day given; 'change my reservation to a different place'
- Changes: 'different restaurant' -> different service; slot corrected to within hours; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, consultation→consultaton
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"10:00","name":"Opal Day","phone":"+12425550146"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"10:00","name":"Opal Day","phone":"+12425550146"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Hi, I would like to make an appointment.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** For a consultaton, for 2 people
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","pendingBareTime":"2:0"}`
3. **Customer:** I want 8pm on Saturday.
   **Receptionist:** We're closed on Saturdays. We're open Monday–Friday, 9:00 AM–5:00 PM (local time). What day would you like to come in instead?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** Ok, what about 7pm?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"19:00"}`
5. **Customer:** Ok, I would like to change it to a cleaing instead, Friday 10am
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"10:00","date":"Friday"}`
6. **Customer:** Opal Day 242-555-0146
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Opal Day","phone":"+12425550146","time":"10:00","date":"Friday"}`
7. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Opal Day","phone":"+12425550146","time":"10:00","date":"Friday"}`

### TM-0907b949-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-0907b949-f00c-4595-8c1a-8978665bf1b6 (restaurant-table-2), variant: typo, seed 6041, derived from TM-0907b949
- Mechanism: tonight slot, then 7?, then back to original time, high-chair special request added late
- Changes: high-chair request -> child-seating/other special request; unconfigured accommodations not promised; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, appointment→appoitment
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Zane Moss","phone":"+12425550147"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Zane Moss","phone":"+12425550147"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I'd like an appoitment for a cleanign
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Nassau
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Thursday at 8pm
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Is there anything at 7?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Thursday 4pm then
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Ok, I forgot to ask: my child needs a booster seat in the chair
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** Zane Moss 242-555-0147
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
8. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-0ea74929-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-0ea74929-d1b0-4c2a-8465-6fb65bf8a389 (restaurant-table-2), variant: typo, seed 6042, derived from TM-0ea74929
- Mechanism: seat preference change, venue switch, tasting-menu / head-chef questions, final time change
- Changes: table by window/fireplace -> unsupported room preferences; menu/chef questions -> unconfigured clinic info; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→claening, Friday→Firday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Friday","preferredTime":"15:00","name":"Quinn Ali","phone":"+12425550148"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 4] named staff / specials are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** I'd like to book a claening for two
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** Firday 4pm please. Ask for the window chair.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"16:00"}`
3. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"16:00"}`
4. **Customer:** Yes, but I'd like the chair near the outdoor fireplace instead.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"16:00"}`
5. **Customer:** Is Dr. Nia doing it? Are there any specials that day?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"16:00"}`
6. **Customer:** Let's make it 3pm instead
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","time":"15:00"}`
7. **Customer:** Quinn Ali 242-555-0148
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Quinn Ali","phone":"+12425550148","time":"15:00"}`
8. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Quinn Ali","phone":"+12425550148","time":"15:00"}`

### TM-0f57a901-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-0f57a901-2757-464f-9613-132bff3ead34 (restaurant-table-2), variant: typo, seed 6043, derived from TM-0f57a901
- Mechanism: headcount change mid-flow, scenic-view request, failed date then alternative date, venue changes, no unsupported promises
- Changes: water view/sunset -> unsupported amenity; date 24th->23rd -> weekday swap; multiple venue hops -> multiple service hops; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Thursday→Thrusday, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Thursday","preferredTime":"15:00","name":"Isla Munn","phone":"+12425550149"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 1] views are not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Please book me a fillign Friday 6pm
   **Receptionist:** 6:00 PM on Friday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** Make sure the room has a stunning view of the water
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Oh I forgot, include my cousin, so that makes two of us
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
4. **Customer:** Let me know ASAP please
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
5. **Customer:** Try Thrusday
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
6. **Customer:** Darn. What about a classy modern clinic instead?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
7. **Customer:** Fine, Thrusday 3pm here then. Isla Munn 242-555-0149
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fine Thrusday Here Then. Isla Munn","phone":"+12425550149","time":"15:00"}`
8. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fine Thrusday Here Then. Isla Munn","phone":"+12425550149","time":"15:00"}`

### TM-209856e2-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-209856e2-3ec2-464c-bbc5-f6013d138ebb (restaurant-table-1), variant: typo, seed 6044, derived from TM-209856e2
- Mechanism: assistant is asked to recall a prior preference ('what's that place I told you to remember'); casual banter
- Changes: recall of a stored restaurant -> recall of a stored dentist/service; no memory exists, must not invent; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, cleaning→cleanign, Tuesday→Tuesdya
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"16:00","name":"Cole Nash","phone":"+12425550150"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** I'm feeling like I should get my teeth checked!
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** What's that treatment I told you to remember I liked?
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Will you book me tomorrow night at 8 for a cleanign?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Wow, how did you do that so quickly?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** Who's your daddy?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** ok book a cleanign Tuesdya at 4pm. Cole Nash 242-555-0150
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-4d9d8a2b-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-4d9d8a2b-4e6d-4923-b8a5-bc8fd4037286 (restaurant-table-2), variant: typo, seed 6045, derived from TM-4d9d8a2b
- Mechanism: special occasion request (cake/gift timing), repeated time moves, patio request, two unrelated details
- Changes: anniversary cake -> birthday cake request (unsupported); party of 8 -> not a clinic concept; patio -> unsupported; typo variant: content-word misspellings (see typoEdits)
- Typo edits: filling→fillign, Friday→Fridya
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"16:00","name":"Joy Hall","phone":"+12425550151"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [repeated-reply @turn 8] identical reply on consecutive turns: "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"
- ❌ [reply-must-match @turn 6] patio is not configured: reply did not match /staff|front desk|team|check|confirm|don't have|do not have|not sure/ — "Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?"

1. **Customer:** Hi, I'd like to book a fillign
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** yes
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment"}`
3. **Customer:** Fridya 4pm
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fridya","time":"16:00"}`
4. **Customer:** Actually, can we do 4:30?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fridya","time":"16:00"}`
5. **Customer:** Let's make it 4pm after all.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fridya","time":"16:00"}`
6. **Customer:** It's my husband's birthday, can you bring out a cake at a certain time?
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fridya","time":"16:00"}`
7. **Customer:** Is there outdoor space like a patio? I'd like to book on the patio.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fridya","time":"16:00"}`
8. **Customer:** Joy Hall 242-555-0151
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fridya","phone":"+12425550151","time":"16:00"}`
9. **Customer:** No, that sounds right.
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","name":"Fridya","phone":"+12425550151","time":"16:00"}`

### TM-55ab43fe-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-55ab43fe-1b96-4b17-9aa3-6d15cf933780 (restaurant-table-2), variant: typo, seed 6046, derived from TM-55ab43fe
- Mechanism: spelling of a name given letter by letter, party-size (3), venue hop, final read-back confirmation
- Changes: spelling correction must be stored as the final name, not the letters; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleaing, Monday→Mondya
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:00","name":"Todd Choiniere","phone":"+12425550152"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hi there, I'm looking to reserve a cleaing
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
2. **Customer:** Todd Choiniere. It's spelled C-h-o-i-n-i-e-r-e.
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
3. **Customer:** Is Saturday available?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
4. **Customer:** Hmm okay. What about that next Mondya around 9am?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** 242-555-0152
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** yes, that's correct
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-56325402-T — FAIL (dev-rule-based fallback (free))

- Source: dlg-56325402-8eb3-4765-9a4a-94eee0d0ab41 (restaurant-table-1), variant: typo, seed 6047, derived from TM-56325402
- Mechanism: recommendation-seeking, quality question, then proceeds; seating preference changes; long inconclusive start
- Changes: 'old-school French restaurant with really good wine' -> 'recommend a service'; no clinical advice invented; typo variant: content-word misspellings (see typoEdits)
- Typo edits: cleaning→cleanign, Thursday→Thrusday
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}
- Actual outcome: escalated
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"15:00","name":"Rhea Dunn","phone":"+12425550153"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "escalated"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0

1. **Customer:** Hello, I'm looking for a good dental service, what do you recommend?
   **Receptionist:** We offer Dental consultation / basic exam (B$75), Routine cleaning (B$125), Basic filling (B$175), Root canal (B$950). Want details on one, or should I help you book?
   _state:_ `{}`
2. **Customer:** Which one is really good?
   **Receptionist:** I'm not totally sure I caught that — I can help with clinic info, booking, rescheduling, or cancellations. What would you like to do?
   _state:_ `{"unclearTurnCount":1}`
3. **Customer:** Excellent, I'll try the cleanign.
   **Receptionist:** I want to make sure you get the right help — let me connect you with a member of our team.
   _state:_ `{}` _actions:_ escalate
4. **Customer:** Thrusday around 4pm
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
5. **Customer:** What about 3pm?
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
6. **Customer:** Perfect, I'll take that. Rhea Dunn 242-555-0153
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`
7. **Customer:** yes
   **Receptionist:** Your request is already with our team, and someone will follow up with you directly. If this is urgent, please contact us directly.
   _state:_ `{}`

### TM-929b59a3-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1), variant: bahamian, seed 10001, derived from TM-929b59a3
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 8] identical reply on consecutive turns: "What day works best for you?"

1. **Customer:** I wanna book me a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Brent Cole
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** 242-555-0112
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning"}`
5. **Customer:** Thursday 6pm
   **Receptionist:** 6:00 PM on Thursday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning"}`
6. **Customer:** Can I come in at 4pm then?
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`
7. **Customer:** how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`
8. **Customer:** Okay, that's fine.
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`
9. **Customer:** yes
   **Receptionist:** What day works best for you?
   _state:_ `{"intent":"book_appointment","phone":"+12425550112","service":"Routine cleaning","time":"16:00"}`

### TM-5cb6cabb-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1), variant: bahamian, seed 10004, derived from TM-5cb6cabb
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 7] identical reply on consecutive turns: "What day and time works best for you?"

1. **Customer:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday 8am
   **Receptionist:** 8:00 AM on Tuesday is outside our hours — we're open Monday–Friday, 9:00 AM–5:00 PM (local time). What time works for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** yinna got other times?
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
5. **Customer:** 9am good, how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
6. **Customer:** Erin Hall 242-555-0115
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning"}`
7. **Customer:** Great! Please go ahead
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning"}`
8. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","name":"Erin Hall","phone":"+12425550115","service":"Routine cleaning"}`

### TM-66c6b5b1-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-66c6b5b1-b41e-441c-bc3f-76e7edb7e5ac (auto-repair-appt-1), variant: bahamian, seed 10006, derived from TM-66c6b5b1
- Mechanism: hard deadline (needs it done before a trip), booking for a family member, price question
- Changes: oil change before a trip -> cleaning before a trip; wife's appointment -> patient is the customer's spouse, booked under the spouse's name; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"10:00","name":"Janet Smith","phone":"+12425550117"}) not found in order

1. **Customer:** Hi, I wanna book me a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** I need it done before Wednesday because I'm travelling.
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
3. **Customer:** Monday 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
4. **Customer:** It's for my wife, Janet Smith
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"For My","service":"Routine cleaning","date":"Wednesday","time":"10:00"}`
5. **Customer:** 242-555-0117
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"For My","phone":"+12425550117","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
6. **Customer:** how much that one?
   **Receptionist:** Routine cleaning is B$125 and takes about 60 minutes. I have you down for Routine cleaning on Wednesday, October 14 at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"For My","phone":"+12425550117","service":"Routine cleaning","date":"Wednesday","time":"10:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, October 14 at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **Customer:** Sounds great, thank you
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-a8533b60-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1), variant: bahamian, seed 10008, derived from TM-a8533b60
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And what time? (please include am/pm)"

1. **Customer:** I need a appointment Monday morning
   **Receptionist:** Sure — which service would you like: Dental consultation / basic exam, Routine cleaning, Basic filling, Root canal?
   _state:_ `{"intent":"book_appointment","date":"Monday"}`
2. **Customer:** A cleaning
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
3. **Customer:** John Smith
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","date":"Monday","service":"Routine cleaning"}`
4. **Customer:** 2425550119
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","phone":"+12425550119","date":"Monday","service":"Routine cleaning"}`
5. **Customer:** yeah man, 9:30 good
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`
6. **Customer:** ok please do
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","phone":"+12425550119","date":"Monday","service":"Routine cleaning","pendingBareTime":"9:30"}`

### TM-3d00c7a6-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-3d00c7a6-6556-4954-adcf-97ca7a4f6b77 (auto-repair-appt-1), variant: bahamian, seed 10015, derived from TM-3d00c7a6
- Mechanism: conflict with customer's own meeting, then add-on request, partial contact info over several turns
- Changes: oil change + tire rotation -> cleaning + (unsupported tire rotation not claimed); contact info volunteered as 'maybe my name and phone' fragments; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"09:00","name":"Maggie Rivera","phone":"+12425550126"}) not found in order
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "And what time? (please include am/pm)"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [reply-must-match @turn 5] tire rotation is not a clinic service: reply did not match /can't|cannot|don't|do not|not (something|offer)|dental|services|we offer/ — "And the best phone number to reach you?"

1. **Customer:** I wanna book me a cleaning, tomorrow or later today if yinna can
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-10-09"}`
2. **Customer:** yes
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-10-09"}`
3. **Customer:** Oh no, I have a meeting at 10am. What about earlier? Wednesday 9am?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"2026-10-09","time":"10:00"}`
4. **Customer:** That is perfect
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"That Is Perfect","service":"Routine cleaning","date":"2026-10-09","time":"10:00"}`
5. **Customer:** Let me think.
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"That Is Perfect","service":"Routine cleaning","date":"2026-10-09","time":"10:00"}`
6. **Customer:** I also need my tires rotated
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"That Is Perfect","service":"Routine cleaning","date":"2026-10-09","time":"10:00"}`
7. **Customer:** Maggie Rivera
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"That Is Perfect","service":"Routine cleaning","date":"2026-10-09","time":"10:00"}`
8. **Customer:** yes. 242-555-0126
   **Receptionist:** I have you down for Routine cleaning on Friday at 10:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"That Is Perfect","phone":"+12425550126","service":"Routine cleaning","date":"2026-10-09","time":"10:00","pendingAction":"confirm_booking"}`
9. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Friday at 10:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-60cceb98-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1), variant: bahamian, seed 10019, derived from TM-60cceb98
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change."

1. **Customer:** I'd like a cleaning next week
   **Receptionist:** Yes — Routine cleaning is B$125 and takes about 60 minutes. Would you like to book it?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","pendingAction":"confirm_service"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday 12:30pm
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **Customer:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
5. **Customer:** wait, lemme change that, 12:30 don't work, make it 1:30
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","name":"Bob Smythe","phone":"+12425550130","date":"Tuesday","time":"12:30","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Tuesday, October 13 at 12:30 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-078a0f20-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1), variant: bahamian, seed 10030, derived from TM-078a0f20
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}
- Actual outcome: completed
- ❌ [repeated-reply @turn 1] identical reply on consecutive turns: "What day and time works best for you?"
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Could I get your name and phone number?"

1. **Customer:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Wednesday if possible
   **Receptionist:** And what time? (please include am/pm)
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **Customer:** got anything sooner than 3pm?
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
5. **Customer:** ok, book Wednesday 3pm then
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **Customer:** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Megan Smith","phone":"+12425550139","service":"Routine cleaning","date":"Wednesday","time":"15:00","pendingAction":"confirm_booking"}`
7. **Customer:** yes that's right
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Wednesday, October 14 at 3:00 PM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment
8. **Customer:** No thanks
   **Receptionist:** You're welcome! Anything else I can help with?
   _state:_ `{}`

### TM-0b5b803f-B — FAIL (dev-rule-based fallback (free))

- Source: dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2), variant: bahamian, seed 10033, derived from TM-0b5b803f
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed; authored Bahamian wording on selected turns
- AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}) not found in order
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "And the best phone number to reach you?"
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "And the best phone number to reach you?"

1. **Customer:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name and phone number?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **Customer:** yes
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Friday","time":"10:00"}`
3. **Customer:** Actually lemme change that, Monday at 11am instead?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Monday","time":"11:00"}`
4. **Customer:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** And the best phone number to reach you?
   _state:_ `{"intent":"book_appointment","name":"Yes","service":"Routine cleaning","date":"Monday","time":"11:00"}`
5. **Customer:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** I have you down for Routine cleaning on Monday, October 12 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","name":"Yes","phone":"+12425550142","service":"Routine cleaning","date":"Monday","time":"11:00","pendingAction":"confirm_booking"}`
6. **Customer:** yes
   **Receptionist:** Perfect — I've captured your request for Routine cleaning on Monday, October 12 at 11:00 AM. A member of the team would confirm the appointment.
   _state:_ `{}` _actions:_ request_appointment

### TM-929b59a3 — FAIL (scripted LLM fixture (free, authored))

- Source: dlg-929b59a3-ebdd-4d57-9033-a185cc211359 (auto-repair-appt-1), variant: adaptation, seed 1001
- Mechanism: details out of order (name/phone before date), price question mid-flow, time retried after refusal
- Changes: oil change -> routine cleaning; vehicle year question dropped (not a clinic concept); price must be the configured B$125, not a source price
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}
- Actual outcome: completed
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Thursday","preferredTime":"16:00","name":"Brent Cole","phone":"+12425550112"}) not found in order
- ❌ [separate-confirmation @turn 8] booking executed without a prior confirmation summary awaiting YES
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 5] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 6] identical reply on consecutive turns: "Thanks — go on."
- ❌ [detail-loss @turn 5] time changed from "18:00" to "16:00" without a customer correction
- ❌ [reply-must-match @turn 4] 6pm is after the 5pm close and must not be accepted: reply did not match /outside|open|hours|9/ — "Thanks — go on."
- ❌ [reply-must-match @turn 6] configured price: reply did not match /B\$\s?125/ — "Thanks — go on."

1. **Customer:** I'd like to schedule a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Brent Cole
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** 242-555-0112
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550112"}`
5. **Customer:** Thursday 6pm
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550112","date":"Thursday","time":"18:00"}`
6. **Customer:** Can I come in at 4pm then?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550112","date":"Thursday","time":"16:00"}`
7. **Customer:** How much will the cleaning be?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550112","date":"Thursday","time":"16:00"}`
8. **Customer:** Okay, that's fine.
   **Receptionist:** I have you down for Routine cleaning on Thursday, October 15 at 4:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550112","date":"Thursday","time":"16:00","name":"Okay That's Fine","pendingAction":"confirm_service"}`
9. **Customer:** yes
   **Receptionist:** I've captured your request — a team member will confirm.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Routine cleaning","date":"Thursday","time":"16:00","name":"Okay That's Fine","phone":"+12425550112"}}` _actions:_ request_appointment

### TM-5cb6cabb — FAIL (scripted LLM fixture (free, authored))

- Source: dlg-5cb6cabb-e801-4c8a-bff7-0cc0ad92bb87 (auto-repair-appt-1), variant: adaptation, seed 1004
- Mechanism: customer asks for other times, price question, then explicit go-ahead
- Changes: engine light/oil change -> routine cleaning; 'what do I need to do' answered only with clinic-configured information
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"09:00","name":"Erin Hall","phone":"+12425550115"}
- Actual outcome: completed
- ❌ [separate-confirmation @turn 7] booking executed without a prior confirmation summary awaiting YES
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Thanks — go on."
- ❌ [detail-loss @turn 4] time changed from "08:00" to "09:00" without a customer correction
- ❌ [reply-must-match @turn 4] configured price: reply did not match /B\$\s?125/ — "Thanks — go on."

1. **Customer:** I need to book a cleaning please
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday 8am
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"08:00"}`
4. **Customer:** Are there other times available?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"08:00"}`
5. **Customer:** 9am works. What will it cost?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00"}`
6. **Customer:** Erin Hall 242-555-0115
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 9:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00","phone":"+12425550115","name":"Erin Hall","pendingAction":"confirm_service"}`
7. **Customer:** Great! Please go ahead
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00","phone":"+12425550115","name":"Erin Hall","pendingAction":"confirm_service"}`
8. **Customer:** yes
   **Receptionist:** I've captured your request — a team member will confirm.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"09:00","name":"Erin Hall","phone":"+12425550115"}}` _actions:_ request_appointment

### TM-a8533b60 — FAIL (scripted LLM fixture (free, authored))

- Source: dlg-a8533b60-f82c-464c-877a-51150ae0bb77 (auto-repair-appt-1), variant: adaptation, seed 1008
- Mechanism: ambiguous 'tomorrow morning' + fragments (one fact per message)
- Changes: oil change + brakes -> cleaning, one fact per message; relative day 'tomorrow' replaced with weekday for clock independence
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Monday","preferredTime":"09:30","name":"John Smith","phone":"+12425550119"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Thanks — go on."

1. **Customer:** I need an appointment Monday morning
   **Receptionist:** Which service would you like to book?
   _state:_ `{"intent":"book_appointment"}`
2. **Customer:** A cleaning
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** John Smith
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
4. **Customer:** 2425550119
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550119"}`
5. **Customer:** yes that works, 9:30
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550119","pendingBareTime":"9:30"}`
6. **Customer:** ok please do
   **Receptionist:** I have you down for Routine cleaning. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","phone":"+12425550119","pendingBareTime":"9:30"}`

### TM-60cceb98 — FAIL (scripted LLM fixture (free, authored))

- Source: dlg-60cceb98-f3d4-4f4c-8340-a5760dd79e46 (auto-repair-appt-1), variant: adaptation, seed 1019
- Mechanism: late correction of a stated time after contact details are given
- Changes: 12:30 -> 1:30 correction after name/phone; no repeated questions
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Routine cleaning","preferredDate":"Tuesday","preferredTime":"13:30","name":"Bob Smythe","phone":"+12425550130"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Thanks — go on."

1. **Customer:** I'd like a cleaning next week
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Tuesday 12:30pm
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30"}`
4. **Customer:** Bob Smythe, 242-555-0130
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30","phone":"+12425550130","name":"Bob Smythe","pendingAction":"confirm_service"}`
5. **Customer:** Wait, I can't do 12:30, can you change it to 1:30?
   **Receptionist:** No problem — I won't book that. What would you like to change, or would you like to continue with what you have so far?
   _state:_ `{"justDeclined":true,"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30","phone":"+12425550130","name":"Bob Smythe","pendingBareTime":"12:30"}`
6. **Customer:** yes
   **Receptionist:** I have you down for Routine cleaning on Tuesday, October 13 at 12:30 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Tuesday","time":"12:30","phone":"+12425550130","name":"Bob Smythe","pendingBareTime":"12:30","pendingAction":"confirm_service"}`

### TM-078a0f20 — FAIL (scripted LLM fixture (free, authored))

- Source: dlg-078a0f20-4efc-4dde-b8c1-fbbd2d80e29d (auto-repair-appt-1), variant: adaptation, seed 1030
- Mechanism: customer pushes for something sooner then books the later slot; read-back confirmation; polite close
- Changes: 'tomorrow if they can' replaced by weekday; no availability claim beyond hours
- Expected: outcome `completed`, bookings 1, action {"service":"Routine cleaning","preferredDate":"Wednesday","preferredTime":"15:00","name":"Megan Smith","phone":"+12425550139"}
- Actual outcome: completed
- ❌ [separate-confirmation @turn 6] booking executed without a prior confirmation summary awaiting YES
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Thanks — go on."

1. **Customer:** I need an appointment for a cleaning
   **Receptionist:** What day and time works best for you?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
2. **Customer:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning"}`
3. **Customer:** Wednesday if possible
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday"}`
4. **Customer:** Anything sooner than 3pm?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
5. **Customer:** oh well. book Wednesday 3pm then
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00"}`
6. **Customer:** Megan Smith 242-555-0139
   **Receptionist:** I have you down for Routine cleaning on Wednesday, October 14 at 3:00 PM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00","phone":"+12425550139","name":"Megan Smith","pendingAction":"confirm_service"}`
7. **Customer:** yes that's right
   **Receptionist:** I've captured your request — a team member will confirm.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00","name":"Megan Smith","phone":"+12425550139"}}` _actions:_ request_appointment
8. **Customer:** No thanks
   **Receptionist:** Thanks — go on.
   _state:_ `{"bookingJustCompleted":true,"lastCompletedBooking":{"intent":"book_appointment","service":"Routine cleaning","date":"Wednesday","time":"15:00","name":"Megan Smith","phone":"+12425550139"}}`

### TM-0b5b803f — FAIL (scripted LLM fixture (free, authored))

- Source: dlg-0b5b803f-ebfc-41f9-b3a0-bcea8b95a08e (restaurant-table-2), variant: adaptation, seed 1033
- Mechanism: slot change request, then revert to original slot, then change of 'venue' (service)
- Changes: date change + revert + venue switch -> date/time revert + service switch; no calendar year 2019 replayed
- Expected: outcome `completed`, bookings 1, action {"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}
- Actual outcome: unresolved
- ❌ [tool_safety] expected action "request_appointment" (success=true, payload⊇{"service":"Basic filling","preferredDate":"Friday","preferredTime":"10:00","name":"Dina Gray","phone":"+12425550142"}) not found in order
- ❌ [resolution] expected outcome "completed", actual "unresolved"
- ❌ [booking-count] expected exactly 1 successful booking action(s), got 0
- ❌ [repeated-reply @turn 2] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 3] identical reply on consecutive turns: "Thanks — go on."
- ❌ [repeated-reply @turn 4] identical reply on consecutive turns: "Thanks — go on."

1. **Customer:** I'd like to book a cleaning for Friday at 10am
   **Receptionist:** Could I get your name?
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
2. **Customer:** yes
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Friday","time":"10:00"}`
3. **Customer:** Actually could we do Monday at 11am instead?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00"}`
4. **Customer:** Hm, could I go back to Friday 10am but make it a filling?
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00"}`
5. **Customer:** Thank you. Could you please make that appointment for me? Dina Gray 242-555-0142
   **Receptionist:** Thanks — go on.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00","phone":"+12425550142"}`
6. **Customer:** yes
   **Receptionist:** I have you down for Routine cleaning on Monday, October 12 at 11:00 AM. Reply YES to confirm the booking, or tell me the service, date, or time you'd like to change.
   _state:_ `{"intent":"book_appointment","service":"Routine cleaning","date":"Monday","time":"11:00","phone":"+12425550142"}`
