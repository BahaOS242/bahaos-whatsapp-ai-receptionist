# BahaOS Master Reliability Requirements

> Supplied by the owner in chat on 2026-10-10 as the consolidated master reliability prompt. Reproduced verbatim; it replaces the earlier placeholder. Note: the "115 customer scenarios supplied in chat" and the "complete supplied live Haiku transcript" referenced in §3 and §6 have NOT been provided to this repository's sessions; see CONVERSATION_TEST_REPORT.md → Limitations.

## Objective and priority

Make BahaOS handle customer conversations reliably using the existing receptionist, conversation state, booking logic, and evaluation harness.

First fix the unsafe bookings and validators already identified. More datasets are useful for coverage, but they are not substitutes for correcting application logic. Expand coverage after these failures are addressed.

Inspect completed work before changing it. Preserve historical evidence, main, and local uncommitted work.

## 1. Strengthen the independent validators

Require application-authorized confirmation of the exact current booking details. Support both providers' legitimate confirmation states. Model-written confirmation prose alone is insufficient.

Require a separate customer approval after the applicable summary. An approval bundled with a material correction must not authorize the changed booking.

Compare resolved calendar dates exactly under the scenario's frozen clock and America/Nassau timezone. Matching weekdays alone is insufficient.

Check attempted and successful actions, stored state, final payloads, duplicate protection, and recovery. Don't let the receptionist or customer simulator grade its own results.

Distinguish unsafe behavior, safe-incomplete conversations, confirmed fixture mismatches, probable fixture mismatches, and not-run cases. Don't represent safe stalls as successful bookings.

## 2. Fix wrong-data bookings

Reproduce the reported junk-name, wrong-date, and wrong-time bookings with focused free regressions.

Names require clear provenance. Questions and acknowledgments such as "How long will it take?", "Yes", "Please", and "For my" must not become patient names. Preserve legitimate names, including multiword, hyphenated, and apostrophe-containing names. Clarify ambiguous identity rather than guessing.

Corrections must replace the relevant stored detail, invalidate stale approval, and require fresh confirmation. Preserve all unrelated valid fields.

Dates, weekdays, opening hours, availability, and final booking outcomes must come from authoritative application logic.

Exactly one correctly populated booking may follow valid approval. Repeated approval and duplicate events must not create duplicate bookings.

## 3. Preserve supplied transcript regressions

Keep the original free browser conversation:
"I want a check up"
"I want a cleaning"
"yes"
Repeated "3pm or 4pm"
"Tuesday 3pm"
"Trevor 2428012847"
"yes"

Recognize checkup wording through configured service aliases or ask a specific clarification. Acknowledge missing date and unresolved time instead of repeating a generic question. Recover normally after "Tuesday 3pm".

Keep the service-information conversation:
"whatsuo"
"where yall located"
"what services yall have for someone who teeth hurting"
"what does each one do"

Handle greeting typos and Bahamian wording. Resolve "each one" to the listed services. Answer from approved tenant knowledge. For tooth pain, offer assessment without diagnosing or selecting treatment. If information is unavailable, say so and offer staff help.

Add reference follow-ups: "how much is that?", "the second one", and "can I book that?" Clarify ambiguous references.

Preserve the complete supplied live Haiku transcript containing:

* Exam selection and Saturday rejection.
* "tuesaday i off that day".
* Early-slot choices and ambiguous approvals.
* Policy questions interrupting booking.
* Explicit "ok 9 am".
* Trevor's name.
* Invalid "911", then corrected phone details.
* Previously supplied day/name requested again.
* Preparation questions during confirmation.
* Repeated yes without completion.
* Incorrect weekday/closure claims.
* Customer frustration followed by restarted questions.

Trace state, model outputs, pending confirmation, and actions after every turn. Don't claim an abridged reconstruction is the original transcript. If the original is unavailable, label the reconstruction and keep that limitation explicit.

Retain all existing name, phone, next-week, time-qualifier, separate-confirmation, and duplicate regressions.

## 4. Improve conversation handling

Validated service, date, time, name, and phone must survive FAQs and interruptions. Answer the question and resume without restarting the booking.

Policies, service descriptions, prices, and preparation advice must come from approved tenant knowledge. Don't claim information is "on file" without a supporting record.

Never ask again for a valid stored detail unless the customer changes it or genuine revalidation is necessary.

When unclear, explain the specific uncertainty. After two unsuccessful clarification attempts for the same detail, offer useful choices or human help instead of repeating a generic prompt.

When told "I already told you", check state and relevant history first.

Never repeat "Reply YES" when yes cannot complete the request. Explain unresolved information.

Human takeover preserves context and suppresses AI actions while human-owned.

## 5. Automated varied customer testing

Keep fixed regressions and add genuinely varied conversation paths:

* Different questions and follow-ups.
* Slang, typos, incomplete messages, and short answers.
* Details supplied together, separately, or out of order.
* Interruptions, corrections, rejected proposals, and ambiguity.
* Repeated approval, duplicates, concurrency, and split messages.
* Cooperative, confused, and frustrated customers.

Don't merely change names or punctuation.

Save expected facts/outcomes, source ID, adaptation notes, seed, provider, exact clean commit, and simulated backend.

Keep fixed scripts alongside bounded adaptive customers. Adaptive customers must not change scenario facts or automatically approve bookings.

Use free fallback and adversarial scripted-LLM tests first. Scripted model replies are fixtures, not live-model evidence.

Assess split-message buffering and propose a design; don't implement it yet.

## 6. Dataset and typo requirements

Use the Taskmaster package with its attribution and license. Use 48 development source conversations and reserve the 12 held-out sources. Group derived variants by source to prevent leakage.

Source assistant replies are not clinic facts or an outcome oracle. Adapt conversation mechanisms to configured clinic facts and synthetic identities.

Include the 115 customer scenarios supplied in chat where available; deduplicate overlaps and report the count. Don't invent missing originals and call them supplied scenarios.

At least half of additional scenarios must include realistic typing mistakes: missing/swapped letters, spacing, punctuation, capitalization, or autocorrect. Mix them with Bahamian wording, abbreviations, and interruptions. Dialect itself is not an error.

Errors in names, phone numbers, dates, or times must not silently change identity or booking intent.

Keep planned cases separate from executed results. Additional datasets are secondary to fixing current unsafe bookings; preserve provenance and applicable licenses.

## 7. Browser testing and readable reports

Keep the local browser chat available with isolated conversations and clear provider/backend labels. Keys stay server-side.

Produce CONVERSATION_TEST_REPORT.md and HTML containing:

* Coverage and result summaries.
* Full chronological executed customer/receptionist transcripts.
* Expected facts and outcomes.
* State/action evidence and failure explanations.
* Provider, clean commit, seed, source attribution, and backend.
* Passed, unsafe, safe-incomplete, mismatch, or not-run classification.
* Changes compared with earlier runs.

Never invent receptionist replies and present them as execution evidence.

The owner should review results without manually repeating captured conversations or using Terminal. Ask for input only for subjective judgment or inaccessible interactions.

## 8. Existing reliability work

Finish any outstanding authorized dependency fixes, startup backend safeguards, application-controlled confirmation prompts, and delivery receipts/staff visibility.

Cover receipts arriving before provider-message-ID persistence, duplicates, ordering, and tenant isolation. Receipt processing triggers no AI call or customer reply.

Preserve the distinction between API acceptance and actual delivery. Keep real WhatsApp delivery marked blocked until verified.

## 9. Verification and boundaries

Replace the placeholder first, then fix validators, reproduce and fix unsafe bookings, commit, and rerun.

Freeze the clock. Use disposable local databases for DB tests. Run appropriate free checks and final required suites. Report only checks actually executed.

Preserve earlier runs unchanged. Reserve held-out evaluation until development failures are addressed.

No additional paid evaluation calls without a separately approved budget. The existing Haiku browser-session authorization is $1 total and must not reset through branch changes or restarts.

No staging migrations, deployment, merge, production changes, Phase 6, or full dynamic UI implementation. Keep PR #2 draft.

Return the branch/head, root causes, implemented fixes, executed evidence, remaining limitations/blockers, and readable report.

Continue routine authorized implementation and automated reruns without asking the owner to type the same conversations again.
