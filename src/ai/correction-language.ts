/**
 * Correction / change-of-mind LANGUAGE ("actually 3pm", "no, 3pm instead",
 * "make it 3pm", "let's do Thursday"). One definition shared by both
 * deterministic extraction paths (DevRuleBasedAIProvider and the shared
 * pre-extraction LLMProvider runs), so they can never disagree.
 *
 * Two jobs, both about FIELD PROVENANCE rather than word lists of names:
 *   1. a message that changes a date/time via correction language is a
 *      date/time UPDATE — whatever text is left over is not an identity
 *      answer (see correctionBlocksBareName);
 *   2. the leftover correction vocabulary is removed before a genuine bare
 *      name is judged ("actually Trevor" -> "Trevor").
 */
const CORRECTION_LANGUAGE_RE =
  /\b(actually|instead|rather|i meant|scratch that|correction|make it|let'?s (?:do|go with|say|try)|change (?:it|that|this|the \w+)(?: to)?|switch (?:it |that )?(?:to)?|nah|nope|sorry|oops|wait|hold on|never ?mind|on second thought)\b|^\s*no[\s,.!]/i;

export function hasCorrectionLanguage(message: string): boolean {
  return CORRECTION_LANGUAGE_RE.test(message);
}

/** Removes correction vocabulary and polite filler, leaving what the customer actually supplied. */
export function stripCorrectionLanguage(text: string): string {
  return text
    .replace(new RegExp(CORRECTION_LANGUAGE_RE.source, "gi"), " ")
    .replace(/\b(please|pls|thanks|thank you|ok(?:ay)?|hmm+|um+|uh+|oh|yeah|yes|hey|hi|then|to|it|that|do|go|with)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a message changes a date/time via correction language and gives
 * no phone number: that is a schedule update, never an identity statement.
 * (A message that ALSO carries a phone number is the customer answering the
 * contact question, so a bare name there stays eligible.)
 */
export function correctionBlocksBareName(
  message: string,
  stated: { date?: unknown; time?: unknown; phone?: unknown },
): boolean {
  return hasCorrectionLanguage(message) && Boolean(stated.date || stated.time) && !stated.phone;
}
