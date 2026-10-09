/**
 * Ukulele chord fingerings (standard GCEA tuning, re-entrant high G).
 *
 * Hand-written shapes for the everyday chords, then a voicing search for the rest.
 * Frets array: [G(4), C(3), E(2), A(1)] — 0 = open, 1+ = fret number.
 */

import { type Fingering, pitchClass, searchVoicings, TUNINGS, toFingering } from "./fretted";
import { canonicalRoot, chordName, parseChord, ROOT_MIDI } from "./theory";

const UKULELE_SHAPES: Record<string, number[]> = {
  // Major
  C: [0, 0, 0, 3],
  "C#": [1, 1, 1, 4],
  D: [2, 2, 2, 0],
  Eb: [0, 3, 3, 1],
  E: [1, 4, 0, 2],
  F: [2, 0, 1, 0],
  "F#": [3, 1, 2, 1],
  G: [0, 2, 3, 2],
  Ab: [5, 3, 4, 3],
  A: [2, 1, 0, 0],
  Bb: [3, 2, 1, 1],
  B: [4, 3, 2, 2],
  // Minor
  Cm: [0, 3, 3, 3],
  "C#m": [1, 1, 0, 4],
  Dm: [2, 2, 1, 0],
  Ebm: [3, 3, 2, 1],
  Em: [0, 4, 3, 2],
  Fm: [1, 0, 1, 3],
  "F#m": [2, 1, 2, 0],
  Gm: [0, 2, 3, 1],
  Abm: [4, 3, 4, 2],
  Am: [2, 0, 0, 0],
  Bbm: [3, 1, 1, 1],
  Bm: [4, 2, 2, 2],
  // Dominant 7th
  C7: [0, 0, 0, 1],
  "C#7": [1, 1, 1, 2],
  D7: [2, 2, 2, 3],
  Eb7: [3, 3, 3, 4],
  E7: [1, 2, 0, 2],
  F7: [2, 3, 1, 3],
  "F#7": [3, 4, 2, 4],
  G7: [0, 2, 1, 2],
  Ab7: [1, 3, 2, 3],
  A7: [0, 1, 0, 0],
  Bb7: [1, 2, 1, 1],
  B7: [2, 3, 2, 2],
  // Minor 7th
  Cm7: [3, 3, 3, 3],
  "C#m7": [1, 1, 0, 2],
  Dm7: [2, 2, 1, 3],
  Ebm7: [3, 3, 2, 4],
  Em7: [0, 2, 0, 2],
  Fm7: [1, 3, 1, 3],
  "F#m7": [2, 4, 2, 4],
  Gm7: [0, 2, 1, 1],
  Abm7: [1, 3, 2, 2],
  Am7: [0, 0, 0, 0],
  Bbm7: [1, 1, 1, 1],
  Bm7: [2, 2, 2, 2],
  // Major 7th
  Cmaj7: [0, 0, 0, 2],
  "C#maj7": [1, 1, 1, 3],
  Dmaj7: [2, 2, 2, 4],
  Ebmaj7: [3, 3, 3, 5],
  Emaj7: [1, 3, 0, 2],
  Fmaj7: [2, 4, 1, 0],
  "F#maj7": [3, 5, 2, 4],
  Gmaj7: [0, 2, 2, 2],
  Abmaj7: [1, 3, 3, 3],
  Amaj7: [1, 1, 0, 0],
  Bbmaj7: [3, 2, 1, 0],
  Bmaj7: [3, 3, 2, 2],
  // Others players reach for
  Csus2: [0, 2, 3, 3],
  Dsus2: [2, 2, 0, 0],
  Gsus2: [0, 2, 3, 0],
  Asus2: [2, 4, 0, 2],
  Csus4: [0, 0, 1, 3],
  Dsus4: [0, 2, 3, 0],
  Gsus4: [0, 2, 3, 3],
  Asus4: [2, 2, 0, 0],
  C6: [0, 0, 0, 0],
  D6: [2, 2, 2, 2],
  G6: [0, 2, 0, 2],
  Cadd9: [0, 2, 0, 3],
  Gadd9: [0, 2, 5, 2],
};

/** Fingerings for a chord name (slash chords show the base chord), at most two. */
export function getUkuleleFingerings(name: string): Fingering[] {
  const chord = parseChord(name);
  if (!chord) return [];
  const shape = UKULELE_SHAPES[chordName(canonicalRoot(chord.root), chord.qualityId)];
  const written = shape ? [toFingering([...shape])] : [];
  // The search adds a voicing further up the neck, or both when none is hand-written
  return searchVoicings(
    TUNINGS.ukulele,
    pitchClass(ROOT_MIDI[chord.root]),
    chord.intervals,
    2,
    written,
  );
}
