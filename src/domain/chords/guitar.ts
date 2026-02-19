/**
 * Guitar chord fingerings.
 *
 * Keyed by chord name. Each chord has 1+ fingerings (open, barre, etc.).
 * Frets array: [lowE(6), A(5), D(4), G(3), B(2), highE(1)]
 *   null = muted, 0 = open, 1+ = fret number
 */

import { canonicalRoot } from "./theory";

export interface GuitarFingering {
  frets: (number | null)[];
  baseFret: number;
  barres?: number[];
}

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

/** Look up fingerings by chord name (resolves enharmonic aliases) */
export function getGuitarFingerings(name: string): GuitarFingering[] {
  if (GUITAR_FINGERINGS[name]) return GUITAR_FINGERINGS[name];
  // Try canonical root: "Dbm" → "C#m"
  const root = name.match(/^[A-G][#b]?/)?.[0];
  if (root) {
    const canon = canonicalRoot(root);
    if (canon !== root) {
      const canonical = canon + name.slice(root.length);
      if (GUITAR_FINGERINGS[canonical]) return GUITAR_FINGERINGS[canonical];
    }
  }
  return [];
}
