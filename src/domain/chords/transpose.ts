import { CHROMATIC_ROOTS, ROOT_MIDI } from "./theory";

/**
 * Transpose a single chord by the given number of semitones.
 *
 * Handles slash chords ("Am/G" → transpose both parts).
 * Non-chord strings pass through unchanged.
 */
export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;

  // Handle slash chords: transpose both parts
  const slashIdx = chord.indexOf("/");
  if (slashIdx !== -1) {
    const base = chord.slice(0, slashIdx);
    const bass = chord.slice(slashIdx + 1);
    return `${transposeChord(base, semitones)}/${transposePart(bass, semitones) ?? bass}`;
  }

  return transposePart(chord, semitones) ?? chord;
}

function transposePart(part: string, semitones: number): string | null {
  const match = part.match(/^[A-G][#b]?/);
  if (!match) return null;

  const root = match[0];
  const midi = ROOT_MIDI[root];
  if (midi === undefined) return null;

  const suffix = part.slice(root.length);
  const idx = (((midi - 60 + semitones) % 12) + 12) % 12;
  const newRoot = CHROMATIC_ROOTS[idx];
  return newRoot + suffix;
}
