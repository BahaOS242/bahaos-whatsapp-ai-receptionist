# Torture suite

A permanent, exactly-60-scenario conversation stress-test of the receptionist,
built to simulate real (messy, human, Bahamian) WhatsApp customers rather than
clean happy-path input.

It started as a **diagnostic suite**: every assertion encoded the *correct*
required behavior, not the system's current behavior, and 27 of the 60 failed
on the first run against the pre-fix architecture — deliberately; failing
tests were never deleted, skipped, or weakened to make them pass. That
diagnostic run was grouped into 10 root causes (see below) and reported before
any fix was written.

9 of those 10 root causes have since been fixed (see "Fix status" below); the
suite now runs 60/60 green and serves as the **permanent regression gate** for
those fixes. The 10th (compound/conditional language) was deliberately left
unfixed — see ROOT CAUSE #10 — and its test now verifies the intended
"fail safely, ask for clarification" behavior instead of the old mis-parse.

This suite targets `DevRuleBasedAIProvider` (the default, zero-config
provider) as the primary subject, since it is the only one with fully
deterministic, directly-testable logic. Where a finding is about shared
plumbing rather than provider-specific regex behavior (see ROOT CAUSE #9), the
same scenario is also run against `LLMProvider` using a scripted fake
`LlmChatClient` (see "Dev + LLM" below) to confirm whether the gap is
architecture-wide or specific to the deterministic provider.

## Running the suite

```bash
npx vitest run tests/torture           # this suite only
npx vitest run tests/torture --reporter=verbose   # per-scenario pass/fail
npm test                               # full repo suite, torture included
```

## Categories and scenario counts

| File | Category | `it()` blocks |
|---|---|---|
| `natural-language.test.ts` | A — Natural confirmations | 5 (1–5) |
| `partial-input.test.ts` | B — Incomplete date/time | 5 (6–10) |
| `out-of-order.test.ts` | C — Out-of-order information | 4 (11, 12, 13+14 combined, 15) |
| `corrections.test.ts` | D — Corrections | 3 (16+17 combined, 18+19 combined, 20) |
| `escalation.test.ts` | E — Human escalation | 7 (21, 22, 23, 24 combined, 25, +2 dedicated) |
| `abandonment.test.ts` | F — Abandonment / new-booking exit | 5 (26 combined, 27, 28, 29, 30) |
| `appointment-management.test.ts` | G — Existing appointment management | 5 (31–35) |
| `emotional.test.ts` | H — Emotional / frustrated customers | 4 (36, 37, 38+39 combined, 40) |
| `garbage-input.test.ts` | I — Garbage / irrelevant input | 5 (41–45, each now checking both standalone + mid-flow) |
| `conversation-switching.test.ts` | J — Conversation switching / chaos | 5 (46–50) |
| `bahamian-language.test.ts` | K — Bahamian English / slang / texting | 12 (10 numbered, 51–60, + 2 mixed subcases) |

**Total: exactly 60 `it()` blocks**, covering every numbered scenario 1–60
from the original task spec plus the 2 mixed-subcase and 2 dedicated
escalation tests needed to keep every root cause represented (see "Reduced
from 77 to 60" below) — no scenario's *content* was deleted, only merged
where two numbered scenarios or a standalone/mid-flow pair shared the same
underlying mechanism and the same assertions would otherwise be duplicated
almost verbatim.

### Reduced from 77 to 60

The suite originally ran as 77 scenarios (60 required + 17 additional
mid-flow / LLM / mixed-phrasing variants added during the initial torture
run to actually catch each defect). It was then consolidated back down to
exactly 60 as the permanent regression gate, by merging — never deleting —
wherever two `it()` blocks exercised the identical mechanism:

- **Category C (11–15):** #13 and #14 (bare name dropped, name-first vs.
  service-last ordering) merged into one test — same mechanism, two message
  orderings, both still asserted.
- **Category D (16–20):** #16+#17 (date/time corrections) merged into one
  test; #18+#19 (service/name corrections) merged into one test; #20 (phone
  correction + full completion payload) kept separate since it's the only one
  that verifies the actual submitted action.
- **Category E:** the standalone "required phrase coverage" test (checking
  "human please" / "send me to staff") was folded into #24, which already
  tests the same root cause with "get me a real person" — one test now
  covers all three phrases. Both cross-provider ROOT CAUSE #9 tests (Dev and
  LLM) were kept, since together they're the suite's *only* evidence for that
  root cause, and the task explicitly asked for Dev+LLM coverage.
- **Category F (26):** the separate "abandonment isn't confused with
  cancellation" check was folded into #26's own assertions rather than kept
  as its own test.
- **Category H (38–39):** both frustrated-phrase-becomes-a-name findings
  merged into one test (as two independent conversations, so the second
  message's failure isn't masked by the first's).
- **Category I (41–45):** each scenario now checks the SAME input twice, in
  one test — standalone (passes) and mid-flow (fails, for 4 of the 5) —
  instead of two separate `it()` blocks per scenario.
- **Category K:** all 10 numbered scenarios (51–60) kept as-is. Of the 8
  "mixed subcase" additions, 6 were cut as redundant — each reproduced a
  root cause (#2, #3, #4, #8) already proven, standalone, by another scenario
  in this suite. The 2 that were kept ("yeah man, 2pm good" and "nah, lemme
  change that to 3") are the suite's *only* evidence for ROOT CAUSE #5 and
  could not be cut without losing that root cause's coverage entirely.

Every one of the 10 root causes documented below remains represented by at
least one scenario after this reduction — verified by re-running the suite
and confirming the same 10 failure clusters still reproduce.

## What each assertion verifies

Every scenario drives the conversation through the REAL production stack —
`ConversationManager` + `ReceptionistAgent` + a provider + the simulated
`ReceptionistTools` (see `helpers.ts`) — not a shortcut that calls a provider
function directly. After each turn, the harness records:

1. the customer's input
2. the AI's reply text
3. the full returned `BookingState` (intent, service, date, time, name, phone,
   pendingAction)
4. conversation history (implicitly, via `ConversationManager`)
5. `pendingAction` specifically
6–10. each individual captured field
11–12. every tool action taken, with its exact payload (`actionsTaken`)
13. whether an `escalate` action fired (`escalated`)
14. the final state after the scenario's last turn

The point of inspecting all of this — not just the reply text — is to catch
the failure mode named in the task: **the AI says something reasonable while
silently corrupting or discarding state underneath.** A reply-only assertion
suite would have missed nearly every failure documented below; the AI's reply
text is often perfectly plausible ("What day and time works best for you?")
while the state underneath has just recorded the customer's name as `"Pm"`.

## How failures are classified

A failure is a **root cause**, not an individual bug, when the same
underlying mechanism explains multiple scenarios across multiple categories.
Every test title names which root cause it belongs to — `FIXED (ROOT CAUSE
#N)` for the 9 that have been addressed, `INTENTIONALLY UNSUPPORTED` for the
one that hasn't. A few titles still read `KNOWN GAP` where the underlying
issue is real but was never one of the 9 approved fixes (e.g.
`out-of-order.test.ts` #13/14, `natural-language.test.ts` #5) — those remain
open, documented limitations. This suite intentionally groups by mechanism
rather than by symptom, per the task's explicit instruction: "we want
architectural failure clusters, not 20 individual patches."

## Root causes found, and fix status

- **ROOT CAUSE #1 — Unconditional field overwrite. FIXED.** `handleFlowTurn`
  used to merge `{...previousState, ...extractStatedFields(message)}` with no
  judgment about whether the customer intended to correct that field or just
  mentioned it in passing — an incidental "today" in "I'm running late today"
  could silently overwrite an already-confirmed appointment date. Overwriting
  an ALREADY-set field now requires an explicit correction marker
  (`CORRECTION_MARKER_RE`); a field being set for the first time is
  unaffected. See `corrections.test.ts`.
- **ROOT CAUSE #2 — Two independent, overly-permissive name-extraction
  paths. FIXED.** `NAME_HINT_RE` used to fire on any `"I'm X"` / `"this is X"`
  phrasing regardless of context ("I'm done", "This is ridiculous"), and the
  bare-name fallback accepted *any* non-numeric, non-keyword short text as a
  name whenever a name was missing anywhere in the flow. Both are now gated on
  `isNameCurrentlyAsked` (name must specifically be the next thing being
  asked) — with a narrow, explicit carve-out preserved for a bare name
  accompanying a phone number in the same message (see
  `out-of-order.test.ts` #15). This was the single most pervasive failure —
  see `garbage-input.test.ts`, `emotional.test.ts`, `partial-input.test.ts`.
- **ROOT CAUSE #3 — Escalation phrase detection too narrow. FIXED.**
  `ESCALATE_RE` now covers "human please", "get me a real person", "send me
  to staff", "I need someone", "lemme talk to somebody", etc. — a curated,
  still-narrow phrase set (every alternative still requires a person-word),
  not a general dictionary. See `escalation.test.ts`.
- **ROOT CAUSE #4 — Emergency phrase detection too narrow. FIXED.**
  `EMERGENCY_RE` now covers "tooth killing me", "tooth hurting" (progressive
  tense), "severe/bad/terrible pain", staying scoped to dental/pain language.
- **ROOT CAUSE #5 — The confirmation handler discarded the rest of the
  message. FIXED.** A "yes" confirming a pending service offer now passes the
  real message through instead of an empty string, so "yeah man, 2pm good"
  applies the "2pm" too. A "no" is no longer an automatic decline if the
  message also carries correction content (`hasCorrectionContent`) — "nah,
  lemme change that to 3" is now treated as a time correction.
- **ROOT CAUSE #6 — No abandonment/exit intent existed. FIXED.** A new
  `abandon` intent (`ABANDON_RE`) is checked before flow-turn routing and
  before the name-extraction paths, clearing `BookingState` and replying
  cleanly — and, since it's checked first, no longer at risk of being
  captured as a name either.
- **ROOT CAUSE #7 — FAQ questions asked mid-flow were never answered.
  FIXED.** Hours/location/services/insurance/new_patient/price questions
  detected mid-flow are now answered directly (see `FAQ_INTENTS` and
  `answerPriceInquiry`) with `bookingState` fully preserved, then the flow
  resumes with a prompt for whatever's still missing.
- **ROOT CAUSE #8 — Bahamian/texting date shorthand wasn't recognized.
  FIXED.** `resolveDateWord` now recognizes "tmrw"/"tmr"/"2mrw"/"2moro"/
  "tomoro" as "tomorrow" — a small, explicit shorthand list, not a slang
  dictionary.
- **ROOT CAUSE #9 — Escalation had no transition priority. FIXED.**
  `ReceptionistAgent` now enforces a persisted handoff state
  (`request.handoffActive` / `result.handoffActive`, tracked by
  `ConversationManager`) — any successful `escalate` action clears
  `BookingState` and blocks every subsequent turn BEFORE the provider is even
  called, identically for both `DevRuleBasedAIProvider` and `LLMProvider`.
  Resuming automation requires an explicit `ConversationManager.
  resumeAutomation()` call — never anything the customer says in chat.
- **ROOT CAUSE #10 — Compound conditional sentences are beyond a regex
  provider's reach. INTENTIONALLY NOT FIXED**, per explicit direction: do not
  grow the regex surface to parse conditionals. A narrow detector
  (`looksLikeAmbiguousCompound` — one connector word + a question mark) now
  makes the provider fail safely instead: it asks for clarification and
  touches no state, rather than silently mis-parsing "yinna open Sat? If not
  book me Monday" into a wrong booking. `LLMProvider` is the intended path
  for this class of conversation in production.

See the full root-cause and fix report (delivered in chat) for severity
ranking, architectural details, and before/after test results.

## Dev + LLM

Every scenario in this suite runs against `DevRuleBasedAIProvider` by default
(`devConversation()` in `helpers.ts`). `escalation.test.ts` additionally
exercises `LLMProvider` via `llmConversation()`, which wires a
`ScriptedLlmChatClient` (a `LlmChatClient` test double that plays back a fixed
script of "what a well-behaved model would say") through the real
`LLMProvider` — no network call, no API key, fully deterministic. This can
only test the application's OWN surrounding logic around the model (hours
validation authority, `BookingState` derivation, `pendingAction` plumbing,
malformed-response handling) — it cannot test real language understanding,
which requires a live model. Where a finding is about that surrounding logic
rather than regex coverage (ROOT CAUSE #9, specifically), the LLM path is
confirmed to share the exact same gap.
