/**
 * Typo tolerance for the few words the booking logic keys on (services,
 * "appointment", weekdays, "tomorrow"). A token within one edit (two for long
 * words) of exactly one of these words, sharing its first letter, is read as
 * that word: "claening" -> cleaning, "Wendesday" -> Wednesday, "apointment" ->
 * appointment. Anything ambiguous or far away is left alone (the receptionist
 * then asks) — it never guesses across the whole dictionary, and real English
 * words that merely look similar ("billing", "ceiling", "clearing") are never
 * rewritten.
 */
const CANONICAL = [
  "cleaning", "filling", "consultation", "appointment", "examination", "checkup",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "tomorrow",
];

/** Real words that sit one edit from a canonical word. */
const REAL_WORDS = new Set([
  "billing", "ceiling", "clearing", "cleaner", "cleanings", "fillings", "feeling", "filming", "falling", "calling",
  "appointments", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays", "sundays",
]);

function osa(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The canonical word a token is a typo of, or undefined (unknown, exact, real word or ambiguous). */
export function repairToken(token: string): string | undefined {
  const t = token.toLowerCase();
  if (t.length < 5 || CANONICAL.includes(t) || REAL_WORDS.has(t)) return undefined;
  const hits = CANONICAL.filter((w) => w[0] === t[0] && Math.abs(w.length - t.length) <= 2 && osa(t, w) <= (w.length >= 8 ? 2 : 1));
  return hits.length === 1 ? hits[0] : undefined;
}

/** Rewrites typo'd key words in a message (case of the first letter is preserved). */
export function repairTypos(text: string): string {
  return text.replace(/[A-Za-z]{5,}/g, (tok) => {
    const fixed = repairToken(tok);
    if (!fixed) return tok;
    return /^[A-Z]/.test(tok) ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
  });
}
