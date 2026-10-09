/**
 * Chord theory — qualities defined by intervals from root.
 *
 * Instrument-agnostic: "C major" is always root + major 3rd + perfect 5th,
 * whether played on guitar, piano, or tuba.
 */

export interface ChordQuality {
  suffix: string;
  /** Other spellings of the suffix accepted when reading a chord name (`Cmin7`, `CΔ`). */
  aliases: string[];
  label: string;
  intervals: number[];
  formula: string;
}

export const QUALITY_IDS = [
  "major",
  "minor",
  "dom7",
  "min7",
  "maj7",
  "sus2",
  "sus4",
  "dom7sus4",
  "dim",
  "dim7",
  "aug",
  "maj6",
  "min6",
  "dom9",
  "add9",
  "min9",
  "maj9",
  "halfDim",
  "dom11",
  "dom13",
] as const;

export type QualityId = (typeof QUALITY_IDS)[number];

export const QUALITIES: Record<QualityId, ChordQuality> = {
  major: {
    suffix: "",
    aliases: ["maj", "M"],
    label: "Major",
    intervals: [0, 4, 7],
    formula: "1 3 5",
  },
  minor: {
    suffix: "m",
    aliases: ["min", "mi", "-"],
    label: "Minor",
    intervals: [0, 3, 7],
    formula: "1 b3 5",
  },
  dom7: { suffix: "7", aliases: [], label: "7th", intervals: [0, 4, 7, 10], formula: "1 3 5 b7" },
  min7: {
    suffix: "m7",
    aliases: ["min7", "mi7", "-7"],
    label: "Minor 7th",
    intervals: [0, 3, 7, 10],
    formula: "1 b3 5 b7",
  },
  maj7: {
    suffix: "maj7",
    aliases: ["M7", "Maj7", "ma7", "Δ", "Δ7"],
    label: "Major 7th",
    intervals: [0, 4, 7, 11],
    formula: "1 3 5 7",
  },
  sus2: { suffix: "sus2", aliases: [], label: "Sus2", intervals: [0, 2, 7], formula: "1 2 5" },
  sus4: { suffix: "sus4", aliases: ["sus"], label: "Sus4", intervals: [0, 5, 7], formula: "1 4 5" },
  dom7sus4: {
    suffix: "7sus4",
    aliases: ["7sus"],
    label: "7sus4",
    intervals: [0, 5, 7, 10],
    formula: "1 4 5 b7",
  },
  dim: {
    suffix: "dim",
    aliases: ["°", "o"],
    label: "Diminished",
    intervals: [0, 3, 6],
    formula: "1 b3 b5",
  },
  dim7: {
    suffix: "dim7",
    aliases: ["°7", "o7"],
    label: "Diminished 7th",
    intervals: [0, 3, 6, 9],
    formula: "1 b3 b5 bb7",
  },
  aug: {
    suffix: "aug",
    aliases: ["+"],
    label: "Augmented",
    intervals: [0, 4, 8],
    formula: "1 3 #5",
  },
  maj6: { suffix: "6", aliases: [], label: "6th", intervals: [0, 4, 7, 9], formula: "1 3 5 6" },
  min6: {
    suffix: "m6",
    aliases: ["min6", "-6"],
    label: "Minor 6th",
    intervals: [0, 3, 7, 9],
    formula: "1 b3 5 6",
  },
  dom9: {
    suffix: "9",
    aliases: [],
    label: "9th",
    intervals: [0, 4, 7, 10, 14],
    formula: "1 3 5 b7 9",
  },
  add9: {
    suffix: "add9",
    aliases: ["add2"],
    label: "Add9",
    intervals: [0, 4, 7, 14],
    formula: "1 3 5 9",
  },
  min9: {
    suffix: "m9",
    aliases: ["min9", "-9"],
    label: "Minor 9th",
    intervals: [0, 3, 7, 10, 14],
    formula: "1 b3 5 b7 9",
  },
  maj9: {
    suffix: "maj9",
    aliases: ["M9", "Maj9", "Δ9"],
    label: "Major 9th",
    intervals: [0, 4, 7, 11, 14],
    formula: "1 3 5 7 9",
  },
  halfDim: {
    suffix: "m7b5",
    aliases: ["ø", "ø7", "m7(b5)", "-7b5", "min7b5"],
    label: "Half-diminished",
    intervals: [0, 3, 6, 10],
    formula: "1 b3 b5 b7",
  },
  dom11: {
    suffix: "11",
    aliases: [],
    label: "11th",
    intervals: [0, 4, 7, 10, 14, 17],
    formula: "1 3 5 b7 9 11",
  },
  // The 11th clashes with the major 3rd: a 13 chord leaves it out
  dom13: {
    suffix: "13",
    aliases: [],
    label: "13th",
    intervals: [0, 4, 7, 10, 14, 21],
    formula: "1 3 5 b7 9 13",
  },
};

/** 12 chromatic roots, one canonical spelling per pitch class */
export const CHROMATIC_ROOTS = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

/** MIDI note number for each root (octave 4, C4 = 60) */
export const ROOT_MIDI: Record<string, number> = {
  C: 60,
  "C#": 61,
  Db: 61,
  D: 62,
  "D#": 63,
  Eb: 63,
  E: 64,
  F: 65,
  "F#": 66,
  Gb: 66,
  G: 67,
  "G#": 68,
  Ab: 68,
  A: 69,
  "A#": 70,
  Bb: 70,
  B: 71,
};

/** Enharmonic root → canonical spelling: "Db" → "C#", "D#" → "Eb" */
const ENHARMONIC: Record<string, string> = {
  Db: "C#",
  "D#": "Eb",
  Gb: "F#",
  "G#": "Ab",
  "A#": "Bb",
};

/** Resolve root to canonical spelling */
export function canonicalRoot(root: string): string {
  return ENHARMONIC[root] ?? root;
}

/** Build chord name: ("C", "minor") → "Cm" */
export function chordName(root: string, qualityId: QualityId): string {
  return root + QUALITIES[qualityId].suffix;
}

/** Every accepted suffix spelling → quality */
const SUFFIX_TO_QUALITY = new Map<string, QualityId>(
  QUALITY_IDS.flatMap((id) => [
    [QUALITIES[id].suffix, id] as const,
    ...QUALITIES[id].aliases.map((alias) => [alias, id] as const),
  ]),
);

export interface ParsedChord {
  root: string;
  qualityId: QualityId;
  intervals: number[];
  /** Slash bass note (`C/G` → "G"), when different from the root */
  bass?: string;
}

const CHORD_NAME_RE = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/;

/**
 * Read a chord name: "Cm7" → C + min7, "Bbmaj7/D" → Bb + maj7 over D.
 * Returns null for unknown qualities (`C6/9`, `N.C.`) or roots we can't place (`Cb`).
 */
export function parseChord(name: string): ParsedChord | null {
  const match = name.trim().match(CHORD_NAME_RE);
  if (!match) return null;
  const [, root, suffix, bass] = match;
  const qualityId = SUFFIX_TO_QUALITY.get(suffix);
  if (!qualityId || ROOT_MIDI[root] === undefined) return null;
  if (bass !== undefined && ROOT_MIDI[bass] === undefined) return null;
  const parsed: ParsedChord = { root, qualityId, intervals: QUALITIES[qualityId].intervals };
  if (bass && ROOT_MIDI[bass] % 12 !== ROOT_MIDI[root] % 12) parsed.bass = bass;
  return parsed;
}

/** Highest key of the keyboard diagram (B5) */
const PIANO_TOP = 83;

export interface PianoVoicing {
  /** Chord tones, root first (C4–B5) */
  notes: number[];
  /** Slash bass, below the chord */
  bass?: number;
}

/**
 * Close-position piano voicing that fits the two-octave diagram (C4–B5):
 * root in octave 4, extensions that would run off the top folded an octave down.
 * A slash bass takes octave 4 and the chord sits above it.
 */
export function pianoVoicing(chord: ParsedChord): PianoVoicing {
  const bass = chord.bass !== undefined ? ROOT_MIDI[chord.bass] : undefined;
  let root = ROOT_MIDI[chord.root];
  while (bass !== undefined && root <= bass) root += 12;
  const notes = chord.intervals.map((interval) => {
    let note = root + interval;
    while (note > PIANO_TOP) note -= 12;
    return note;
  });
  return bass !== undefined ? { notes, bass } : { notes };
}

/** Display groups: which qualities to show, with which roots */
export interface ChordGroup {
  qualityId: QualityId;
  roots: readonly string[];
}

export const CHORD_GROUPS: ChordGroup[] = QUALITY_IDS.map((qualityId) => ({
  qualityId,
  roots: CHROMATIC_ROOTS,
}));
