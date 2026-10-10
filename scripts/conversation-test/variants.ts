import type { ConvScenario } from "./types";
import { adaptations } from "./scenarios";

/**
 * Derived variants. All variants keep the sourceId of their parent so a
 * source conversation never appears on both sides of a split.
 *
 * Typo variants: deterministic content-word misspellings (service, weekday,
 * "appointment", "tomorrow"). Names, phone numbers and yes/no answers are
 * never altered, so a failure points at extraction robustness rather than
 * at an ambiguous confirmation. Choice among alternative misspellings is
 * made from the scenario seed.
 */
const TYPOS: [RegExp, string[]][] = [
  [/\bcleaning\b/gi, ["cleanign", "claening", "cleaing"]],
  [/\bfilling\b/gi, ["filing", "fillign"]],
  [/\bconsultation\b/gi, ["consultaton", "conslutation"]],
  [/\bappointment\b/gi, ["apointment", "appoitment"]],
  [/\bTuesday\b/g, ["Tuesdya", "Tusday"]],
  [/\bWednesday\b/g, ["Wendesday", "Wednsday"]],
  [/\bThursday\b/g, ["Thurday", "Thrusday"]],
  [/\bFriday\b/g, ["Firday", "Fridya"]],
  [/\bMonday\b/g, ["Mondya", "Munday"]],
  [/\btomorrow\b/gi, ["tomorow", "tommorow"]],
  [/\bcheck-?up\b/gi, ["chekup"]],
];

export function makeTypoVariant(base: ConvScenario): ConvScenario | null {
  const edits: [string, string][] = [];
  let turns = base.turns.slice();
  let applied = 0;
  for (const [re, options] of TYPOS) {
    if (applied >= 2) break;
    if (!turns.some((t) => new RegExp(re.source, re.flags).test(t))) continue;
    const replacement = options[base.seed % options.length];
    const next = turns.map((t) =>
      t.replace(new RegExp(re.source, re.flags), (m) => {
        const typo =
          m[0] === m[0].toUpperCase()
            ? replacement[0].toUpperCase() + replacement.slice(1)
            : replacement;
        edits.push([m, typo]);
        return typo;
      }),
    );
    turns = next;
    applied++;
  }
  if (!applied) return null;
  return {
    ...base,
    id: `${base.id}-T`,
    variant: "typo",
    derivedFrom: base.id,
    turns,
    typoEdits: edits,
    changes: [...base.changes, "typo variant: content-word misspellings (see typoEdits)"],
    seed: base.seed + 5000,
  };
}

/**
 * Authored Bahamian-wording augmentation. NOT source dialect: the Taskmaster
 * sources are U.S. English. Wording is borrowed from phrasings already used
 * in tests/torture/bahamian-language.test.ts and is intentionally light.
 */
const BAHAMIAN: Record<string, Record<number, string>> = {
  "TM-929b59a3": { 0: "I wanna book me a cleaning", 6: "how much that one?" },
  "TM-66c6b5b1": { 0: "Hi, I wanna book me a cleaning", 5: "how much that one?" },
  "TM-60cceb98": {
    0: "I'd like a cleaning next week",
    4: "wait, lemme change that, 12:30 don't work, make it 1:30",
  },
  "TM-a8533b60": { 0: "I need a appointment Monday morning", 4: "yeah man, 9:30 good" },
  "TM-078a0f20": { 3: "got anything sooner than 3pm?", 4: "ok, book Wednesday 3pm then" },
  "TM-5cb6cabb": { 3: "yinna got other times?", 4: "9am good, how much that one?" },
  "TM-0b5b803f": { 2: "Actually lemme change that, Monday at 11am instead?" },
  "TM-3d00c7a6": { 0: "I wanna book me a cleaning, tomorrow or later today if yinna can" },
};

export function makeBahamianVariant(base: ConvScenario): ConvScenario | null {
  const patch = BAHAMIAN[base.id];
  if (!patch) return null;
  const turns = base.turns.map((t, i) => patch[i] ?? t);
  return {
    ...base,
    id: `${base.id}-B`,
    variant: "bahamian",
    derivedFrom: base.id,
    turns,
    augmentation:
      "AUTHORED AUGMENTATION: Bahamian-English wording added by the BahaOS team; the source dialog is U.S. English and contains no such dialect.",
    changes: [...base.changes, "authored Bahamian wording on selected turns"],
    seed: base.seed + 9000,
  };
}

export const typoVariants = adaptations
  .map(makeTypoVariant)
  .filter((v): v is ConvScenario => v !== null);
export const bahamianVariants = adaptations
  .map(makeBahamianVariant)
  .filter((v): v is ConvScenario => v !== null);
export { adaptations };
export const allScenarios: ConvScenario[] = [...adaptations, ...typoVariants, ...bahamianVariants];
