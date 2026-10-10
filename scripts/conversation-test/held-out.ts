import index from "./source-index.json";

/**
 * Held-out reservation. These 12 source dialogs are reserved for the FINAL
 * evaluation only. No adaptation, prompt example, typo variant, or
 * regression test may be derived from them. The repository stores their IDs
 * (for leakage auditing) and nothing else: no text, no mechanism notes.
 * Status in every report: NOT RUN (reserved).
 */
export const heldOutIds: string[] = (index.conversations as { id: string; split: string }[])
  .filter((c) => c.split === "held_out")
  .map((c) => c.id);
