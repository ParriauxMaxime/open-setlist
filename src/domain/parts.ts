/**
 * Band parts ("My part" filter in performance mode).
 *
 * ChordPro `for=` values are free-form: each band writes its own vocabulary
 * (`for=gtr`, `for=guitare`, `for=🎸`). Known synonyms map to a canonical part
 * so they match each other; unknown values are kept as-is (lowercased).
 */

export const PART = {
  vocals: "vocals",
  guitar: "guitar",
  bass: "bass",
  keys: "keys",
  drums: "drums",
  sax: "sax",
  trumpet: "trumpet",
  violin: "violin",
} as const;

export type Part = (typeof PART)[keyof typeof PART];

export const PART_VALUES: Part[] = Object.values(PART);

/** Pseudo-part: show every instrument's sections. */
export const ALL_PARTS = "all";

export const PART_EMOJI: Record<Part, string> = {
  vocals: "🎙️",
  guitar: "🎸",
  bass: "",
  keys: "🎹",
  drums: "🥁",
  sax: "🎷",
  trumpet: "🎺",
  violin: "🎻",
};

const PART_SYNONYMS: Record<Part, readonly string[]> = {
  vocals: ["vocal", "vox", "voice", "voix", "chant", "singer", "chanteur", "chanteuse", "🎙", "🎤"],
  guitar: ["guitars", "gtr", "guit", "guitare", "guitares", "🎸"],
  bass: ["basse", "bassist"],
  keys: ["key", "keyboard", "keyboards", "piano", "clavier", "claviers", "synth", "🎹"],
  drums: ["drum", "batterie", "🥁"],
  sax: ["saxophone", "saxo", "🎷"],
  trumpet: ["trompette", "tpt", "🎺"],
  violin: ["violon", "fiddle", "🎻"],
};

const SYNONYM_TO_PART = new Map<string, Part>(
  PART_VALUES.flatMap((part) => [
    [part, part] as const,
    ...PART_SYNONYMS[part].map((s) => [s, part] as const),
  ]),
);

/** Lowercase, drop accents and emoji variation selectors, trailing punctuation. */
function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ️]/g, "")
    .replace(/[,;.]+$/, "");
}

/** Canonical name for a `for=` value: `"Guitare"` → `"guitar"`, `"Trombone"` → `"trombone"`. */
export function normalizePart(value: string): string {
  const folded = fold(value);
  return SYNONYM_TO_PART.get(folded) ?? folded;
}

export function isKnownPart(value: string): value is Part {
  return (PART_VALUES as string[]).includes(value);
}

/** De-duplicated parts: known ones first (in `PART` order), then the others alphabetically. */
export function sortParts(parts: Iterable<string>): string[] {
  const rank = (p: string) => (isKnownPart(p) ? PART_VALUES.indexOf(p) : PART_VALUES.length);
  return [...new Set(parts)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
