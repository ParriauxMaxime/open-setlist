/**
 * Chord theory — qualities defined by intervals from root.
 *
 * Instrument-agnostic: "C major" is always root + major 3rd + perfect 5th,
 * whether played on guitar, piano, or tuba.
 */

export interface ChordQuality {
  suffix: string;
  label: string;
  intervals: number[];
  formula: string;
}

export const QUALITIES: Record<string, ChordQuality> = {
  major: { suffix: "", label: "Major", intervals: [0, 4, 7], formula: "1 3 5" },
  minor: { suffix: "m", label: "Minor", intervals: [0, 3, 7], formula: "1 b3 5" },
  dom7: { suffix: "7", label: "7th", intervals: [0, 4, 7, 10], formula: "1 3 5 b7" },
  min7: { suffix: "m7", label: "Minor 7th", intervals: [0, 3, 7, 10], formula: "1 b3 5 b7" },
  maj7: { suffix: "maj7", label: "Major 7th", intervals: [0, 4, 7, 11], formula: "1 3 5 7" },
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
export function chordName(root: string, qualityId: string): string {
  return root + (QUALITIES[qualityId]?.suffix ?? "");
}

/** Compute MIDI notes: ("C", [0, 4, 7]) → [60, 64, 67] */
export function chordMidi(root: string, intervals: number[]): number[] {
  const base = ROOT_MIDI[root];
  if (base === undefined) return [];
  return intervals.map((i) => base + i);
}

/** Parse chord name → root + intervals (e.g. "Cm7" → { root: "C", intervals: [0,3,7,10] }) */
export function parseChordSuffix(name: string): { root: string; intervals: number[] } | null {
  const rootMatch = name.match(/^[A-G][#b]?/);
  if (!rootMatch) return null;
  const root = rootMatch[0];
  const suffix = name.slice(root.length);
  const quality = Object.values(QUALITIES).find((q) => q.suffix === suffix);
  if (!quality) return null;
  return { root, intervals: quality.intervals };
}

/** Display groups: which qualities to show, with which roots */
export interface ChordGroup {
  qualityId: string;
  roots: readonly string[];
}

export const CHORD_GROUPS: ChordGroup[] = [
  { qualityId: "major", roots: CHROMATIC_ROOTS },
  { qualityId: "minor", roots: CHROMATIC_ROOTS },
  { qualityId: "dom7", roots: CHROMATIC_ROOTS },
  { qualityId: "min7", roots: CHROMATIC_ROOTS },
  { qualityId: "maj7", roots: CHROMATIC_ROOTS },
];
