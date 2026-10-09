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

/**
 * Words that END a name introduced with "my name is …". A CLOSED grammatical class
 * (negations, conjunctions, pronouns, auxiliaries, correction vocabulary) — not a list
 * of things that "aren't names" — so the boundary never depends on comma punctuation:
 * "my name is Alisha not Alicia" -> "Alisha", "my name is Sarah and I want…" -> "Sarah".
 */
const NAME_BOUNDARY_WORDS = new Set([
  "not", "no", "nor", "never", "isn't", "isnt", "and", "but", "or", "so", "because", "though", "although", "while", "then",
  "i", "i'm", "im", "i'd", "i'll", "my", "me", "you", "we", "it", "its", "it's", "is", "was", "are", "am", "be",
  "actually", "instead", "rather", "sorry", "please", "pls", "thanks", "thank", "wait", "oops", "nah", "nope",
  "want", "need", "would", "like", "can", "could", "for", "to", "at", "on", "in", "with", "from",
]);

/** Emphasis words that may sit between "my name is" and the name itself. */
const NAME_LEAD_IN_WORDS = new Set(["actually", "really", "just", "now", "sorry", "um", "uh", "well", "honestly"]);

/** Cuts an introduced-name candidate at the first boundary word; returns "" if the first word is one. */
export function trimNameAtBoundary(candidate: string): string {
  const kept: string[] = [];
  let leading = true;
  for (const word of candidate.trim().split(/\s+/)) {
    // "my name is ACTUALLY Trevon": emphasis words BEFORE the name are skipped (a negation such as "not" is not).
    if (leading && NAME_LEAD_IN_WORDS.has(word.toLowerCase().replace(/[.,;:!?]+$/, ""))) continue;
    leading = false;
    if (NAME_BOUNDARY_WORDS.has(word.toLowerCase().replace(/[.,;:!?]+$/, ""))) break;
    kept.push(word.replace(/[.,;:!?]+$/, ""));
  }
  return kept.join(" ");
}
