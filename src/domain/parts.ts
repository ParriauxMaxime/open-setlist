/**
 * Band parts ("My part" filter in performance mode).
 *
 * ChordPro `for=` values are free-form: each band writes its own vocabulary
 * (`for=gtr`, `for=guitare`, `for=🎸`). Known synonyms map to a canonical part
 * so they match each other; unknown values are kept as-is (lowercased).
 *
 * Each known part also has a pitch: charts are in concert pitch, and transposing
 * instruments (B♭ trumpet, E♭ alto sax, F horn) can read them at their written pitch.
 */

import { transposeKey } from "./chords/transpose";

export const PART = {
  vocals: "vocals",
  guitar: "guitar",
  bass: "bass",
  keys: "keys",
  drums: "drums",
  flute: "flute",
  clarinet: "clarinet",
  sax: "sax",
  sopranoSax: "soprano-sax",
  altoSax: "alto-sax",
  tenorSax: "tenor-sax",
  baritoneSax: "baritone-sax",
  horn: "horn",
  trumpet: "trumpet",
  trombone: "trombone",
  tuba: "tuba",
  violin: "violin",
} as const;

export type Part = (typeof PART)[keyof typeof PART];

export const PART_VALUES: Part[] = Object.values(PART);

/** Pseudo-part: show every instrument's sections. */
export const ALL_PARTS = "all";

/** No clarinet, trombone or tuba emoji in Unicode: they get their family's (reed, brass). */
export const PART_EMOJI: Record<Part, string> = {
  vocals: "🎙️",
  guitar: "🎸",
  bass: "",
  keys: "🎹",
  drums: "🥁",
  flute: "🪈",
  clarinet: "🎷",
  sax: "🎷",
  "soprano-sax": "🎷",
  "alto-sax": "🎷",
  "tenor-sax": "🎷",
  "baritone-sax": "🎷",
  horn: "📯",
  trumpet: "🎺",
  trombone: "🎺",
  tuba: "🎺",
  violin: "🎻",
};

// `for=` values stop at the first space: multi-word names are written with a dash
const PART_SYNONYMS: Record<Part, readonly string[]> = {
  vocals: ["vocal", "vox", "voice", "voix", "chant", "singer", "chanteur", "chanteuse", "🎙", "🎤"],
  guitar: ["guitars", "gtr", "guit", "guitare", "guitares", "🎸"],
  bass: ["basse", "bassist"],
  keys: ["key", "keyboard", "keyboards", "piano", "clavier", "claviers", "synth", "🎹"],
  drums: ["drum", "batterie", "🥁"],
  flute: ["flutes", "fl", "🪈"],
  clarinet: ["clarinets", "clarinette", "clarinettes", "cl", "clar"],
  sax: ["saxophone", "saxo", "🎷"],
  "soprano-sax": ["sopranosax", "soprano-saxophone", "sax-soprano", "saxophone-soprano"],
  "alto-sax": ["altosax", "alto-saxophone", "sax-alto", "saxalto", "saxophone-alto"],
  "tenor-sax": ["tenorsax", "tenor-saxophone", "sax-tenor", "saxtenor", "saxophone-tenor"],
  "baritone-sax": [
    "bari",
    "bari-sax",
    "barisax",
    "baritone-saxophone",
    "sax-baryton",
    "saxbaryton",
    "saxophone-baryton",
  ],
  horn: ["french-horn", "cor", "cors", "📯"],
  trumpet: ["trompette", "tpt", "🎺"],
  trombone: ["trombones", "tbn", "trb"],
  tuba: ["tubas", "sousaphone", "soubassophone"],
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

// ---------------------------------------------------------------------------
// Pitch (transposing instruments)
// ---------------------------------------------------------------------------

/** Concert note an instrument's written C sounds: a B♭ trumpet playing a written C sounds B♭. */
export const INSTRUMENT_PITCH = {
  concert: "C",
  bFlat: "Bb",
  eFlat: "Eb",
  f: "F",
} as const;

export type InstrumentPitch = (typeof INSTRUMENT_PITCH)[keyof typeof INSTRUMENT_PITCH];

export const INSTRUMENT_PITCH_VALUES: InstrumentPitch[] = Object.values(INSTRUMENT_PITCH);

/**
 * Semitones from concert to written pitch, octave left out: a tenor sax reads a major ninth
 * (+14) above concert, the same note names as a B♭ trumpet (+2).
 */
export const WRITTEN_PITCH_OFFSET: Record<InstrumentPitch, number> = {
  C: 0,
  Bb: 2,
  Eb: 9,
  F: 7,
};

/** A plain `sax` is taken as an alto, the most common in bands and fanfares. */
const PART_PITCH: Record<Part, InstrumentPitch> = {
  vocals: "C",
  guitar: "C",
  bass: "C",
  keys: "C",
  drums: "C",
  flute: "C",
  clarinet: "Bb",
  sax: "Eb",
  "soprano-sax": "Bb",
  "alto-sax": "Eb",
  "tenor-sax": "Bb",
  "baritone-sax": "Eb",
  horn: "F",
  trumpet: "Bb",
  trombone: "C",
  tuba: "C",
  violin: "C",
};

/** Pitch of a part (synonyms accepted); unknown parts and "all" are in concert pitch. */
export function partPitch(part: string): InstrumentPitch {
  const normalized = normalizePart(part);
  return isKnownPart(normalized) ? PART_PITCH[normalized] : INSTRUMENT_PITCH.concert;
}

/**
 * Key a transposing player reads, from the concert key: ("Dm", B♭) → "Em", ("F", E♭) → "D".
 * Accepts solfège keys; undefined when the key cannot be parsed.
 */
export function writtenKey(
  concertKey: string | undefined,
  pitch: InstrumentPitch,
): string | undefined {
  return transposeKey(concertKey, WRITTEN_PITCH_OFFSET[pitch]);
}
