/**
 * Privacy for anything the knowledge engine logs or stores about a
 * customer's question. A knowledge question is rarely sensitive, but a
 * customer can type anything — so the redacted form strips phone numbers,
 * emails and long digit runs and is hard-truncated. Raw messages are never
 * persisted by this subsystem.
 */
export function redactQuery(text: string, maxLength = 160): string {
  const cleaned = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "[number]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/**
 * Removes contact details from text BEFORE it is scored/embedded. A phone
 * number or email inside a question ("what should I bring? my number is
 * 242-555-0123") is not part of what is being asked — left in, its digits
 * would count as unseen "informative terms" and wrongly sink the match.
 * (Short numbers such as "24 hours" or "$125" are kept: they matter.)
 */
export function stripContactDetails(text: string): string {
  const detail = "(?:[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+|\\+?\\d[\\d\\s().-]{5,}\\d)";
  // The detail plus the little phrase that introduces it ("my number is",
  // "call me on", "you can reach me at"), so "number" doesn't linger as a
  // phantom topic word.
  const intro =
    "(?:\\b(?:my|the)\\s+(?:(?:phone|cell|mobile|contact)\\s+)?(?:number|email|e-?mail)\\s*(?:is|:)?\\s*" +
    "|\\b(?:you can\\s+)?(?:call|text|reach|email|contact)\\s+me\\s+(?:on|at)\\s*|\\bat\\s+)?";
  return text.replace(new RegExp(`${intro}${detail}`, "gi"), " ").replace(/\s+/g, " ").trim();
}
