/**
 * Musical constants and domain types.
 *
 * A song's key is a chord — "Dm" means D minor, "D" means D major.
 * We list all 12 major + 12 minor keys using both sharp and flat spellings
 * where common (e.g. C#m and Dbm are both listed).
 */

/** The 12 chromatic root notes (with enharmonic sharps/flats). */
export const ROOT_NOTES = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
] as const;

export type RootNote = (typeof ROOT_NOTES)[number];

/** Extract root note from a chord name: "C#m7" → "C#", "Ebmaj7" → "Eb" */
export function chordRoot(name: string): string {
  const match = name.match(/^[A-G][#b]?/);
  return match ? match[0] : name;
}

export const MAJOR_KEYS = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
] as const;

export const MINOR_KEYS = [
  "Cm",
  "C#m",
  "Dbm",
  "Dm",
  "D#m",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gbm",
  "Gm",
  "G#m",
  "Abm",
  "Am",
  "A#m",
  "Bbm",
  "Bm",
] as const;

export const MUSICAL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS] as const;

export type MusicalKey = (typeof MUSICAL_KEYS)[number];

export const MUSICAL_KEY_LIST: string[] = [...MUSICAL_KEYS];

// ---------------------------------------------------------------------------
// Key relationship helpers (used by smart song suggestions)
// ---------------------------------------------------------------------------

import { CHROMATIC_ROOTS, ROOT_MIDI } from "@domain/chords/theory";

/** Parse a key string into root + isMinor. "Am" → { root: "A", minor: true } */
function parseKey(key: string): { root: string; minor: boolean } | undefined {
  const match = key.match(/^([A-G][#b]?)(m?)$/);
  if (!match) return undefined;
  const midi = ROOT_MIDI[match[1]];
  if (midi === undefined) return undefined;
  return { root: match[1], minor: match[2] === "m" };
}

/**
 * Returns the relative major/minor of a key.
 * Minor → relative major (+3 semitones), Major → relative minor (-3 semitones).
 * e.g. "Am" → "C", "C" → "Am", "G" → "Em"
 */
export function relativeKey(key: string): string | undefined {
  const parsed = parseKey(key);
  if (!parsed) return undefined;

  const midi = ROOT_MIDI[parsed.root];
  const offset = parsed.minor ? 3 : -3;
  const targetMidi = (((midi + offset - 60) % 12) + 12) % 12; // pitch class 0-11
  const targetRoot = CHROMATIC_ROOTS[targetMidi];

  return parsed.minor ? targetRoot : `${targetRoot}m`;
}

/**
 * Returns true if two keys represent the same pitch class and quality.
 * Enharmonic-aware: "C#" and "Db" are the same, "C#m" and "Dbm" are the same.
 */
export function sameKeyEnharmonic(a: string, b: string): boolean {
  const pa = parseKey(a);
  const pb = parseKey(b);
  if (!pa || !pb) return false;
  return pa.minor === pb.minor && ROOT_MIDI[pa.root] === ROOT_MIDI[pb.root];
}
