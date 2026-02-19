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
