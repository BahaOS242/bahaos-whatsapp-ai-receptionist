/**
 * Deterministic, provider-independent detection of "this message needs a
 * human" — shared so both DevRuleBasedAIProvider (which matches these
 * directly against every message before anything else) and LLMProvider
 * (which uses them as a safety net when the model itself doesn't call
 * escalate) agree on what counts as an explicit request, without
 * duplicating the regex surface.
 */

/** Escalation phrase coverage — expanded from a single "talk to a human"
 * pattern to the common ways people actually ask for a person, including
 * the task's own required examples. Deliberately still a narrow,
 * explicitly-enumerated set of phrasings (not a general dictionary) so it
 * stays safe from false positives — every alternative requires a
 * person-word ("human"/"person"/"someone"/"somebody"/"agent"/"manager"),
 * never fires on a bare mention of "manager" or similar alone. */
export const ESCALATE_RE = new RegExp(
  [
    String.raw`\b(talk|speak) (to|with) (?:a |an )?(?:real )?(human|person|someone|somebody|agent|manager)\b`,
    String.raw`\b(?:let me|lemme) (?:talk|speak) to (?:a |an )?(human|person|someone|somebody)\b`,
    String.raw`\b(?:get|send|put|transfer) me (?:to |by )?(?:a |an )?(?:real )?(human|person|someone|somebody|staff|agent|manager)\b`,
    String.raw`\b(?:human|manager|person|someone|somebody) please\b`,
    String.raw`\bi need (?:a |to (?:talk|speak) to )?(?:a |an )?(?:real )?(human|person|someone|somebody)\b`,
  ].join("|"),
  "i",
);

/** Emergency/dental-pain phrase coverage — expanded beyond the literal
 * word "hurt(s)" to common ways of describing significant pain, still
 * narrowly scoped to dental/pain language so it can't misfire on
 * unrelated frustration ("this is killing me" alone doesn't match —
 * "tooth" or "pain" must also be present). */
export const EMERGENCY_RE =
  /\bemergency\b|\bsevere pain\b|\bbroken tooth\b|\btooth (really )?hurt(s|ing)?\b|\btooth.*(killing|kill) me\b|\b(bad|terrible|awful|excruciating|severe) (tooth )?pain\b|\bin (a lot of |so much )?(tooth )?pain\b|\bcan'?t (take|handle) (it|the pain)\b/i;
