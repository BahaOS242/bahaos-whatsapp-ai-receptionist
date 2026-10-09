# Receptionist test findings

## Evidence boundaries
Baseline: October 9, 2026 America/Nassau receptionist conversation report supplied in the referenced chat (source `0bb6106816e3fee4630e6f8dc1d738f7edec98bc` plus local working-tree files). The attached report was read; its underlying transcript artifacts were not available here. Its results are historical, not rerun in this review.

| Baseline coverage | Reported result |
| --- | --- |
| Existing fallback conversations | 35/38 pass |
| Additional date/time/dialect conversations | 14/27 pass |
| Offline subset | 1,016 pass / 70 files; four HTTP files excluded |
| Live Anthropic, real DB persistence, webhook deduplication, scheduled delivery | Not tested in this report |

Independent remote review: `ba3671dde678b1fe2a7b02eac486f0482c454b96`. Read booking progression/confirmation, fallback provider, shared message extraction, LLM provider, action schemas, agent, database booking tools, date parser and timestamp resolver. Historical progress-document claims are not fresh validation.

## Critical: correction becomes identity
Report reproduction:
`I want a cleaning` → `yes` → `Tuesday 2pm` → `actually 3pm` → `Trevor 2428012847` → `yes`.

Reported intermediate name is Actually; final request_appointment payload still has name Actually. Variant: `nah make it 3pm instead` followed by `Alicia 2425550100` records Nah Make It Instead.

Static remote evidence (not a fresh full-conversation execution):
- `src/ai/providers/dev-rule-based-provider.ts:598-627, 1032-1042`: name-request context or extracted time enables bare-name capture; stripping time leaves correction language. Weak candidates only require capitalization/word count. Capture requires merged.name to be absent, so later bare name+phone cannot replace the accidental value.
- `src/ai/message-field-extraction.ts:547-560`: LLMProvider's deterministic pre-extraction also strips date/time when name is next. Its NON_NAME_WORDS omits actually; this warrants a scripted LLM regression as well as live Anthropic evaluation.
- `src/ai/providers/llm-provider.ts:349` invokes this shared extraction before the model. `src/tools/database-receptionist-tools.ts:144` passes the supplied name to customer resolution. Model quality alone cannot establish identity safety.

Proposed fix: treat a time-only correction as a time update with no name candidate. Preserve explicit field provenance; require a direct identity answer or explicit name introduction before accepting identity. Permit explicit later name replacement and invalidate prior confirmation on a material change. Do not rely on an expanding filler-word blacklist.

Required assertions: corrected time 15:00; name remains absent after correction; later name is Trevor/Alicia; no completing action before explicit confirmation; exactly one final request with the correct name/time. Test both absent-name and already-known-name cases, explicit `My name is Alisha, not Alicia`, negative correction, and phone supplied out of order.

## Critical: next week qualifier is discarded
Executed independently using byte-for-byte UTF-8 copies of the two remote TypeScript modules and Node v24.6.0 native type stripping; no application/provider/DB/network calls:
- Fixed now `2026-10-09T16:00:00Z` (noon Nassau).
- `resolveDateWord("next week Friday at 2pm", now, "America/Nassau")` returned `Friday`; expected `2026-10-16`.
- Control `next Friday at 2pm` returned `2026-10-16`.
- Passing that bare Friday to `resolveAppointmentTimestamp` at 14:00 returned `2026-10-09T18:00:00.000Z`; expected `2026-10-16T18:00:00.000Z`.

Root cause: `src/ai/date-time.ts:39-40, 90-140` recognizes next + weekday, not next week + weekday, then falls back to a weekday label. The timestamp resolver allows today when its requested time is still future. Both providers use resolveDateWord. Existing hours/confirmation checks can accept a valid but semantically wrong date.

Proposed fix: resolve qualified week expressions before bare weekdays, producing ISO dates anchored to the tenant timezone. Define next-week policy (e.g. next calendar week starting Monday) and clarify unsupported/conflicting qualifiers instead of dropping them. Use one authoritative injected clock throughout extraction/confirmation/tool execution. Update stripRecognizedDateTime consistently without allowing the remainder to become a name.

Repeat across weekdays, Sunday/Monday boundary, year rollover and local midnight; retain the documented next-Friday rule. Assert final action date and resolved UTC timestamp, not reply text alone.

### Minimal parser reproduction (Node 24, isolated checkout)
```sh
node --input-type=module -e 'import {resolveDateWord} from "./src/ai/date-time.ts"; import {resolveAppointmentTimestamp} from "./src/ai/appointment-timestamp.ts"; const now=new Date("2026-10-09T16:00:00Z"); const date=resolveDateWord("next week Friday at 2pm",now,"America/Nassau"); console.log(date); console.log(resolveAppointmentTimestamp({business:{timezone:"America/Nassau"},weekday:date,time:"14:00",now}));'
```
This prints the defect; it is not a passing regression test.

### Proposed full-conversation regression
Add to a dedicated Vitest test file using `tests/torture/helpers.ts` (not added/executed by this documentation PR):
```ts
import { expect, test, vi } from "vitest";
import { devConversation } from "./helpers";

test("time correction cannot become customer identity", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T16:00:00Z"));
  try {
    const c = devConversation();
    await c.sayAll(["I want a cleaning", "yes", "Tuesday 2pm"]);
    const correction = await c.say("actually 3pm");
    expect(correction.bookingState.time).toBe("15:00");
    expect(correction.bookingState.name).toBeUndefined();
    await c.say("Trevor 2428012847");
    expect(c.last.bookingState.name).toBe("Trevor");
    await c.say("yes");
    const bookings = c.turns.flatMap(t => t.actionsTaken)
      .filter(a => a.action.type === "request_appointment");
    expect(bookings).toHaveLength(1);
    expect(bookings[0].action.payload).toMatchObject({
      name: "Trevor", preferredTime: "15:00"
    });
  } finally {
    vi.useRealTimers();
  }
});
```
Add a parallel conversation with `next week Friday at 2pm` and assert `preferredDate: "2026-10-16"`, `preferredTime: "14:00"`. Test the shared LLM extraction with a scripted client separately; run the identical transcripts against live Anthropic only with simulated tools.

## Other baseline gaps and proposed checks
- Natural time formats, ISO/24-hour dates, service typos and dialect: assess both providers against identical inputs; ambiguous times must clarify with no action.
- Appointment inquiry must retrieve verified existing information or explain lookup limitations; must not begin a new booking.
- Repeated YES must produce at most one action and avoid needless escalation.
- Replay with the SAME WhatsApp message ID must be tested through real disposable inbox/DB plumbing; replaying fresh chat turns is not proof of webhook failure.
- Human takeover must block provider calls and unsent AI delivery; persisted state/restart, tenant isolation and worker crash/retry require integration tests.

## Execution ledger for this review
Executed: two date-parser probes (one reproduced defect, one control correct) and one timestamp probe (reproduced wrong date). No full suite, eval corpus, name conversation, lint/typecheck/build, Anthropic, DB or WhatsApp run was executed. No fixes were applied to runtime code. Release status: blocked pending the gates.
