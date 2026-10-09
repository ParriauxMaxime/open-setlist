/**
 * Guitar chord fingerings.
 *
 * Hand-written voicings keyed by chord name (open chords and the usual barres), then
 * movable E-shape / A-shape barre templates for any root × quality they don't cover.
 * Frets array: [lowE(6), A(5), D(4), G(3), B(2), highE(1)]
 *   null = muted, 0 = open, 1+ = fret number
 */

import {
  byPosition,
  type Fingering,
  pitchClass,
  TUNINGS,
  toFingering,
  uniqueFingerings,
} from "./fretted";
import { canonicalRoot, chordName, parseChord, type QualityId, ROOT_MIDI } from "./theory";

export type GuitarFingering = Fingering;

export const GUITAR_FINGERINGS: Record<string, GuitarFingering[]> = {
  // -- Major ----------------------------------------------------------------
  C: [
    { frets: [null, 3, 2, 0, 1, 0], baseFret: 1 },
    { frets: [null, 3, 5, 5, 5, 3], baseFret: 3, barres: [3] },
  ],
  "C#": [
    { frets: [null, 4, 6, 6, 6, 4], baseFret: 4, barres: [4] },
    { frets: [9, 11, 11, 10, 9, 9], baseFret: 9, barres: [9] },
  ],
  D: [
    { frets: [null, null, 0, 2, 3, 2], baseFret: 1 },
    { frets: [null, 5, 7, 7, 7, 5], baseFret: 5, barres: [5] },
  ],
  Eb: [
    { frets: [null, null, 1, 3, 4, 3], baseFret: 1, barres: [1] },
    { frets: [null, 6, 8, 8, 8, 6], baseFret: 6, barres: [6] },
  ],
  E: [
    { frets: [0, 2, 2, 1, 0, 0], baseFret: 1 },
    { frets: [null, 7, 9, 9, 9, 7], baseFret: 7, barres: [7] },
  ],
  F: [
    { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, barres: [1] },
    { frets: [null, 8, 10, 10, 10, 8], baseFret: 8, barres: [8] },
  ],
  "F#": [
    { frets: [2, 4, 4, 3, 2, 2], baseFret: 2, barres: [2] },
    { frets: [null, 9, 11, 11, 11, 9], baseFret: 9, barres: [9] },
  ],
  G: [
    { frets: [3, 2, 0, 0, 0, 3], baseFret: 1 },
    { frets: [3, 5, 5, 4, 3, 3], baseFret: 3, barres: [3] },
  ],
  Ab: [
    { frets: [4, 6, 6, 5, 4, 4], baseFret: 4, barres: [4] },
    { frets: [null, 11, 13, 13, 13, 11], baseFret: 11, barres: [11] },
  ],
  A: [
    { frets: [null, 0, 2, 2, 2, 0], baseFret: 1 },
    { frets: [5, 7, 7, 6, 5, 5], baseFret: 5, barres: [5] },
  ],
  Bb: [
    { frets: [null, 1, 3, 3, 3, 1], baseFret: 1, barres: [1] },
    { frets: [6, 8, 8, 7, 6, 6], baseFret: 6, barres: [6] },
  ],
  B: [
    { frets: [null, 2, 4, 4, 4, 2], baseFret: 2, barres: [2] },
    { frets: [7, 9, 9, 8, 7, 7], baseFret: 7, barres: [7] },
  ],

  // -- Minor ----------------------------------------------------------------
  Cm: [
    { frets: [null, 3, 5, 5, 4, 3], baseFret: 3, barres: [3] },
    { frets: [8, 10, 10, 8, 8, 8], baseFret: 8, barres: [8] },
  ],
  "C#m": [
    { frets: [null, 4, 6, 6, 5, 4], baseFret: 4, barres: [4] },
    { frets: [9, 11, 11, 9, 9, 9], baseFret: 9, barres: [9] },
  ],
  Dm: [
    { frets: [null, null, 0, 2, 3, 1], baseFret: 1 },
    { frets: [null, 5, 7, 7, 6, 5], baseFret: 5, barres: [5] },
  ],
  Ebm: [
    { frets: [null, null, 1, 3, 4, 2], baseFret: 1 },
    { frets: [null, 6, 8, 8, 7, 6], baseFret: 6, barres: [6] },
  ],
  Em: [
    { frets: [0, 2, 2, 0, 0, 0], baseFret: 1 },
    { frets: [null, 7, 9, 9, 8, 7], baseFret: 7, barres: [7] },
  ],
  Fm: [
    { frets: [1, 3, 3, 1, 1, 1], baseFret: 1, barres: [1] },
    { frets: [null, 8, 10, 10, 9, 8], baseFret: 8, barres: [8] },
  ],
  "F#m": [
    { frets: [2, 4, 4, 2, 2, 2], baseFret: 2, barres: [2] },
    { frets: [null, 9, 11, 11, 10, 9], baseFret: 9, barres: [9] },
  ],
  Gm: [
    { frets: [3, 5, 5, 3, 3, 3], baseFret: 3, barres: [3] },
    { frets: [null, 10, 12, 12, 11, 10], baseFret: 10, barres: [10] },
  ],
  Abm: [
    { frets: [4, 6, 6, 4, 4, 4], baseFret: 4, barres: [4] },
    { frets: [null, 11, 13, 13, 12, 11], baseFret: 11, barres: [11] },
  ],
  Am: [
    { frets: [null, 0, 2, 2, 1, 0], baseFret: 1 },
    { frets: [5, 7, 7, 5, 5, 5], baseFret: 5, barres: [5] },
  ],
  Bbm: [
    { frets: [null, 1, 3, 3, 2, 1], baseFret: 1, barres: [1] },
    { frets: [6, 8, 8, 6, 6, 6], baseFret: 6, barres: [6] },
  ],
  Bm: [
    { frets: [null, 2, 4, 4, 3, 2], baseFret: 2, barres: [2] },
    { frets: [7, 9, 9, 7, 7, 7], baseFret: 7, barres: [7] },
  ],

  // -- Dominant 7th ---------------------------------------------------------
  // E7-shape at n: [n, n+2, n, n+1, n, n]  A7-shape at n: [x, n, n+2, n, n+2, n]
  C7: [
    { frets: [null, 3, 2, 3, 1, 0], baseFret: 1 },
    { frets: [null, 3, 5, 3, 5, 3], baseFret: 3, barres: [3] },
  ],
  "C#7": [
    { frets: [null, 4, 6, 4, 6, 4], baseFret: 4, barres: [4] },
    { frets: [9, 11, 9, 10, 9, 9], baseFret: 9, barres: [9] },
  ],
  D7: [
    { frets: [null, null, 0, 2, 1, 2], baseFret: 1 },
    { frets: [null, 5, 7, 5, 7, 5], baseFret: 5, barres: [5] },
  ],
  Eb7: [
    { frets: [null, 6, 8, 6, 8, 6], baseFret: 6, barres: [6] },
    { frets: [11, 13, 11, 12, 11, 11], baseFret: 11, barres: [11] },
  ],
  E7: [
    { frets: [0, 2, 0, 1, 0, 0], baseFret: 1 },
    { frets: [null, 7, 9, 7, 9, 7], baseFret: 7, barres: [7] },
  ],
  F7: [
    { frets: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [1] },
    { frets: [null, 8, 10, 8, 10, 8], baseFret: 8, barres: [8] },
  ],
  "F#7": [
    { frets: [2, 4, 2, 3, 2, 2], baseFret: 2, barres: [2] },
    { frets: [null, 9, 11, 9, 11, 9], baseFret: 9, barres: [9] },
  ],
  G7: [
    { frets: [3, 2, 0, 0, 0, 1], baseFret: 1 },
    { frets: [3, 5, 3, 4, 3, 3], baseFret: 3, barres: [3] },
  ],
  Ab7: [
    { frets: [4, 6, 4, 5, 4, 4], baseFret: 4, barres: [4] },
    { frets: [null, 11, 13, 11, 13, 11], baseFret: 11, barres: [11] },
  ],
  A7: [
    { frets: [null, 0, 2, 0, 2, 0], baseFret: 1 },
    { frets: [5, 7, 5, 6, 5, 5], baseFret: 5, barres: [5] },
  ],
  Bb7: [
    { frets: [null, 1, 3, 1, 3, 1], baseFret: 1, barres: [1] },
    { frets: [6, 8, 6, 7, 6, 6], baseFret: 6, barres: [6] },
  ],
  B7: [
    { frets: [null, 2, 1, 2, 0, 2], baseFret: 1 },
    { frets: [7, 9, 7, 8, 7, 7], baseFret: 7, barres: [7] },
  ],

  // -- Minor 7th ------------------------------------------------------------
  // Em7-shape at n: [n, n+2, n, n, n, n]  Am7-shape at n: [x, n, n+2, n, n+1, n]
  Cm7: [
    { frets: [null, 3, 5, 3, 4, 3], baseFret: 3, barres: [3] },
    { frets: [8, 10, 8, 8, 8, 8], baseFret: 8, barres: [8] },
  ],
  "C#m7": [
    { frets: [null, 4, 6, 4, 5, 4], baseFret: 4, barres: [4] },
    { frets: [9, 11, 9, 9, 9, 9], baseFret: 9, barres: [9] },
  ],
  Dm7: [
    { frets: [null, null, 0, 2, 1, 1], baseFret: 1 },
    { frets: [null, 5, 7, 5, 6, 5], baseFret: 5, barres: [5] },
  ],
  Ebm7: [
    { frets: [null, 6, 8, 6, 7, 6], baseFret: 6, barres: [6] },
    { frets: [11, 13, 11, 11, 11, 11], baseFret: 11, barres: [11] },
  ],
  Em7: [
    { frets: [0, 2, 0, 0, 0, 0], baseFret: 1 },
    { frets: [null, 7, 9, 7, 8, 7], baseFret: 7, barres: [7] },
  ],
  Fm7: [
    { frets: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [1] },
    { frets: [null, 8, 10, 8, 9, 8], baseFret: 8, barres: [8] },
  ],
  "F#m7": [
    { frets: [2, 4, 2, 2, 2, 2], baseFret: 2, barres: [2] },
    { frets: [null, 9, 11, 9, 10, 9], baseFret: 9, barres: [9] },
  ],
  Gm7: [
    { frets: [3, 5, 3, 3, 3, 3], baseFret: 3, barres: [3] },
    { frets: [null, 10, 12, 10, 11, 10], baseFret: 10, barres: [10] },
  ],
  Abm7: [
    { frets: [4, 6, 4, 4, 4, 4], baseFret: 4, barres: [4] },
    { frets: [null, 11, 13, 11, 12, 11], baseFret: 11, barres: [11] },
  ],
  Am7: [
    { frets: [null, 0, 2, 0, 1, 0], baseFret: 1 },
    { frets: [5, 7, 5, 5, 5, 5], baseFret: 5, barres: [5] },
  ],
  Bbm7: [
    { frets: [null, 1, 3, 1, 2, 1], baseFret: 1, barres: [1] },
    { frets: [6, 8, 6, 6, 6, 6], baseFret: 6, barres: [6] },
  ],
  Bm7: [
    { frets: [null, 2, 0, 2, 0, 2], baseFret: 1 },
    { frets: [null, 2, 4, 2, 3, 2], baseFret: 2, barres: [2] },
  ],

  // -- Major 7th ------------------------------------------------------------
  // Emaj7-shape at n: [n, n+2, n+1, n+1, n, n]  Amaj7-shape at n: [x, n, n+2, n+1, n+2, n]
  Cmaj7: [
    { frets: [null, 3, 2, 0, 0, 0], baseFret: 1 },
    { frets: [null, 3, 5, 4, 5, 3], baseFret: 3, barres: [3] },
  ],
  "C#maj7": [
    { frets: [null, 4, 6, 5, 6, 4], baseFret: 4, barres: [4] },
    { frets: [9, 11, 10, 10, 9, 9], baseFret: 9, barres: [9] },
  ],
  Dmaj7: [
    { frets: [null, null, 0, 2, 2, 2], baseFret: 1 },
    { frets: [null, 5, 7, 6, 7, 5], baseFret: 5, barres: [5] },
  ],
  Ebmaj7: [
    { frets: [null, 6, 8, 7, 8, 6], baseFret: 6, barres: [6] },
    { frets: [11, 13, 12, 12, 11, 11], baseFret: 11, barres: [11] },
  ],
  Emaj7: [
    { frets: [0, 2, 1, 1, 0, 0], baseFret: 1 },
    { frets: [null, 7, 9, 8, 9, 7], baseFret: 7, barres: [7] },
  ],
  Fmaj7: [
    { frets: [null, null, 3, 2, 1, 0], baseFret: 1 },
    { frets: [1, 3, 2, 2, 1, 1], baseFret: 1, barres: [1] },
  ],
  "F#maj7": [
    { frets: [2, 4, 3, 3, 2, 2], baseFret: 2, barres: [2] },
    { frets: [null, 9, 11, 10, 11, 9], baseFret: 9, barres: [9] },
  ],
  Gmaj7: [
    { frets: [3, 2, 0, 0, 0, 2], baseFret: 1 },
    { frets: [3, 5, 4, 4, 3, 3], baseFret: 3, barres: [3] },
  ],
  Abmaj7: [
    { frets: [4, 6, 5, 5, 4, 4], baseFret: 4, barres: [4] },
    { frets: [null, 11, 13, 12, 13, 11], baseFret: 11, barres: [11] },
  ],
  Amaj7: [
    { frets: [null, 0, 2, 1, 2, 0], baseFret: 1 },
    { frets: [5, 7, 6, 6, 5, 5], baseFret: 5, barres: [5] },
  ],
  Bbmaj7: [
    { frets: [null, 1, 3, 2, 3, 1], baseFret: 1, barres: [1] },
    { frets: [6, 8, 7, 7, 6, 6], baseFret: 6, barres: [6] },
  ],
  Bmaj7: [
    { frets: [null, 2, 4, 3, 4, 2], baseFret: 2, barres: [2] },
    { frets: [7, 9, 8, 8, 7, 7], baseFret: 7, barres: [7] },
  ],
};

// -- Open voicings for the other qualities -----------------------------------
// The barre templates below also give the open E and A forms (root fret 0).
const OPEN_EXTRAS: Record<string, (number | null)[][]> = {
  Csus2: [[null, 3, 0, 0, 1, null]],
  Dsus2: [[null, null, 0, 2, 3, 0]],
  Gsus2: [[3, 0, 0, 0, 3, 3]],
  Csus4: [[null, 3, 3, 0, 1, 1]],
  Dsus4: [[null, null, 0, 2, 3, 3]],
  Gsus4: [[3, 3, 0, 0, 1, 3]],
  C7sus4: [[null, 3, 3, 3, 1, 1]],
  D7sus4: [[null, null, 0, 2, 1, 3]],
  G7sus4: [[3, 3, 0, 0, 1, 1]],
  Ddim: [[null, null, 0, 1, 3, 1]],
  Ddim7: [[null, null, 0, 1, 0, 1]],
  Edim7: [[0, 1, 2, 0, 2, 0]],
  Bdim7: [[null, 2, 3, 1, 3, 1]],
  Caug: [[null, 3, 2, 1, 1, 0]],
  Daug: [[null, null, 0, 3, 3, 2]],
  Gaug: [[3, 2, 1, 0, 0, 3]],
  C6: [[null, 3, 2, 2, 1, 0]],
  D6: [[null, null, 0, 2, 0, 2]],
  G6: [[3, 2, 0, 0, 0, 0]],
  Dm6: [[null, null, 0, 2, 0, 1]],
  G9: [[3, null, 0, 2, 0, 1]],
  A9: [[null, 0, 2, 4, 2, 3]],
  Cadd9: [[null, 3, 2, 0, 3, 0]],
  Dadd9: [[null, 5, 4, 2, 3, 0]],
  Gadd9: [[3, null, 0, 2, 0, 3]],
  Cmaj9: [[null, 3, 2, 4, 3, 0]],
  Dmaj9: [[null, null, 0, 2, 2, 0]],
  Fmaj9: [[null, null, 3, 2, 1, 3]],
  Gmaj9: [[3, null, 0, 2, 0, 2]],
  Amaj9: [[null, 0, 2, 1, 0, 0]],
  Dm7b5: [[null, null, 0, 1, 1, 1]],
  Em7b5: [[0, 1, 0, 0, 3, 0]],
  A13: [[null, 0, 2, 0, 2, 2]],
  E13: [[0, 2, 0, 1, 2, 0]],
};

// -- Movable barre templates -------------------------------------------------
// Fret offsets from the root fret; the root is on the low E (E-shape) or A string (A-shape).
type Template = (number | null)[];

const E_SHAPES: Partial<Record<QualityId, Template>> = {
  major: [0, 2, 2, 1, 0, 0],
  minor: [0, 2, 2, 0, 0, 0],
  dom7: [0, 2, 0, 1, 0, 0],
  min7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  dom7sus4: [0, 2, 0, 2, 0, 0],
  dim: [0, 1, 2, 0, null, null],
  dim7: [0, null, -1, 0, -1, null],
  aug: [0, 3, 2, 1, 1, 0],
  maj6: [0, 2, 2, 1, 2, 0],
  min6: [0, 2, 2, 0, 2, 0],
  dom9: [0, 2, 0, 1, 0, 2],
  add9: [0, 2, 4, 1, 0, 0],
  min9: [0, 2, 0, 0, 0, 2],
  maj9: [0, null, 1, 1, 0, 2],
  halfDim: [0, null, 0, 0, -1, null],
  dom11: [0, 0, 0, 1, 0, 2],
  dom13: [0, null, 0, 1, 2, null],
};

const A_SHAPES: Record<QualityId, Template> = {
  major: [null, 0, 2, 2, 2, 0],
  minor: [null, 0, 2, 2, 1, 0],
  dom7: [null, 0, 2, 0, 2, 0],
  min7: [null, 0, 2, 0, 1, 0],
  maj7: [null, 0, 2, 1, 2, 0],
  sus2: [null, 0, 2, 2, 0, 0],
  sus4: [null, 0, 2, 2, 3, 0],
  dom7sus4: [null, 0, 2, 0, 3, 0],
  dim: [null, 0, 1, 2, 1, null],
  dim7: [null, 0, 1, 2, 1, 2],
  aug: [null, 0, 3, 2, 2, 1],
  maj6: [null, 0, 2, 2, 2, 2],
  min6: [null, 0, 2, 2, 1, 2],
  dom9: [null, 0, -1, 0, 0, 0],
  add9: [null, 0, 2, 4, 2, 0],
  min9: [null, 0, -2, 0, 0, 0],
  maj9: [null, 0, -1, 1, 0, null],
  halfDim: [null, 0, 1, 0, 1, null],
  dom11: [null, 0, 0, 0, 0, 0],
  dom13: [null, 0, -1, 0, 2, 2],
};

/** Place a template so its root string sounds `root`. */
function placeTemplate(template: Template, rootString: number, root: string): Fingering {
  let rootFret = pitchClass(ROOT_MIDI[root] - TUNINGS.guitar[rootString]);
  const lowest = Math.min(...template.filter((o): o is number => o !== null));
  // A shape reaching below its root fret needs room: move it up an octave
  if (lowest < 0 && rootFret + lowest <= 0) rootFret += 12;
  return toFingering(template.map((o) => (o === null ? null : rootFret + o)));
}

/** E-shape and A-shape voicings of a chord, lowest on the neck first. */
export function barreFingerings(root: string, qualityId: QualityId): Fingering[] {
  if (ROOT_MIDI[root] === undefined) return [];
  const eShape = E_SHAPES[qualityId];
  const shapes = [
    ...(eShape ? [placeTemplate(eShape, 0, root)] : []),
    placeTemplate(A_SHAPES[qualityId], 1, root),
  ];
  return uniqueFingerings(shapes).sort(byPosition);
}

/**
 * Fingerings for a chord name (enharmonic roots and suffix spellings resolved).
 * Slash chords show the base chord. Hand-written voicings come first; barre templates
 * fill in when there are fewer than two.
 */
export function getGuitarFingerings(name: string): GuitarFingering[] {
  const chord = parseChord(name);
  if (!chord) return [];
  const key = chordName(canonicalRoot(chord.root), chord.qualityId);
  const written = GUITAR_FINGERINGS[key] ?? (OPEN_EXTRAS[key] ?? []).map(toFingering);
  if (written.length >= 2) return written;
  return uniqueFingerings([...written, ...barreFingerings(chord.root, chord.qualityId)]);
}
