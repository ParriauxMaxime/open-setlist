import { normalizeKey } from "../import/normalize-key";
import { CHROMATIC_ROOTS, ROOT_MIDI } from "./theory";

const SHARP_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** Conventional key name per pitch class: fewest accidentals (F# and Ebm on 6-accidental ties). */
const MAJOR_KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const MINOR_KEY_NAMES = [
  "Cm",
  "C#m",
  "Dm",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "Bbm",
  "Bm",
] as const;

const FLAT_KEYS = new Set([
  "F",
  "Bb",
  "Eb",
  "Ab",
  "Db",
  "Gb",
  "Dm",
  "Gm",
  "Cm",
  "Fm",
  "Bbm",
  "Ebm",
]);
/** No accidentals in the signature: keep the mixed default spelling (C#, Eb, F#, Ab, Bb). */
const NEUTRAL_KEYS = new Set(["C", "Am"]);

function pitchClass(midi: number): number {
  return (((midi - 60) % 12) + 12) % 12;
}

/**
 * Transpose a key by the given number of semitones: ("Dm", 2) → "Em", ("C", 3) → "Eb".
 * Accepts solfège ("RÉm"). Returns undefined if the key cannot be parsed.
 */
export function transposeKey(key: string | undefined, semitones: number): string | undefined {
  const normalized = normalizeKey(key);
  if (!normalized) return undefined;
  if (semitones % 12 === 0) return normalized;

  const minor = normalized.endsWith("m");
  const root = minor ? normalized.slice(0, -1) : normalized;
  const pc = pitchClass(ROOT_MIDI[root] + semitones);
  return minor ? MINOR_KEY_NAMES[pc] : MAJOR_KEY_NAMES[pc];
}

/** Spelling for chord roots in a key: flats in flat keys, sharps in sharp keys. */
function rootsForKey(key: string | undefined): readonly string[] {
  if (!key) return CHROMATIC_ROOTS;
  const base = NEUTRAL_KEYS.has(key)
    ? CHROMATIC_ROOTS
    : FLAT_KEYS.has(key)
      ? FLAT_ROOTS
      : SHARP_ROOTS;
  if (!key.endsWith("m")) return base;
  // Minor keys spell the leading tone sharp, as in harmonic minor: A/C# in Dm, E/G# in Am.
  const leadingTone = pitchClass(ROOT_MIDI[key.slice(0, -1)] - 1);
  return base.map((root, pc) => (pc === leadingTone ? SHARP_ROOTS[pc] : root));
}

/** Capo fret from a `{capo: N}` value (1–11), else undefined. */
export function parseCapo(raw: string | undefined): number | undefined {
  const fret = Number.parseInt(raw ?? "", 10);
  return fret > 0 && fret < 12 ? fret : undefined;
}

/**
 * Transpose a single chord by the given number of semitones.
 *
 * Handles slash chords ("Am/G" → transpose both parts).
 * With a song key, roots are spelled for the target key (song key + semitones):
 * Dm +3 → Fm uses flats (Ab, Db), Dm +2 → Em uses sharps (F#, C#).
 * Without a known key, uses the fixed spelling of CHROMATIC_ROOTS.
 * Annotations (`*N.C.`) and non-chord strings pass through unchanged.
 */
export function transposeChord(chord: string, semitones: number, songKey?: string): string {
  if (semitones === 0 || chord.startsWith("*")) return chord;
  const roots = rootsForKey(transposeKey(songKey, semitones));

  // Handle slash chords: transpose both parts
  const slashIdx = chord.indexOf("/");
  if (slashIdx !== -1) {
    const base = chord.slice(0, slashIdx);
    const bass = chord.slice(slashIdx + 1);
    return `${transposePart(base, semitones, roots) ?? base}/${transposePart(bass, semitones, roots) ?? bass}`;
  }

  return transposePart(chord, semitones, roots) ?? chord;
}

function transposePart(part: string, semitones: number, roots: readonly string[]): string | null {
  const match = part.match(/^[A-G][#b]?/);
  if (!match) return null;

  const root = match[0];
  const midi = ROOT_MIDI[root];
  if (midi === undefined) return null;

  const suffix = part.slice(root.length);
  return roots[pitchClass(midi + semitones)] + suffix;
}
