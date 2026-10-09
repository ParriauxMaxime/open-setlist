/**
 * Shared helpers for fretted instruments (guitar, ukulele, bass): tunings,
 * display position, barre detection and a small voicing search.
 */

import type { FrettedInstrument } from "./types";

export interface Fingering {
  /** One entry per string, lowest-pitched string first: null = muted, 0 = open, N = fret */
  frets: (number | null)[];
  /** First fret shown on the diagram (1 = the nut is drawn) */
  baseFret: number;
  barres?: number[];
}

/** Open-string MIDI notes, in diagram order (left to right). */
export const TUNINGS: Record<FrettedInstrument, readonly number[]> = {
  guitar: [40, 45, 50, 55, 59, 64], // E2 A2 D3 G3 B3 E4
  ukulele: [67, 60, 64, 69], // G4 C4 E4 A4 (re-entrant)
  bass: [28, 33, 38, 43], // E1 A1 D2 G2
};

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function frettedFrets(frets: readonly (number | null)[]): number[] {
  return frets.filter((f): f is number => f !== null && f > 0);
}

/** Nut when everything fits in the first four frets, else the lowest fretted note. */
export function displayBaseFret(frets: readonly (number | null)[]): number {
  const fretted = frettedFrets(frets);
  if (fretted.length === 0 || Math.max(...fretted) <= 4) return 1;
  return Math.min(...fretted);
}

/**
 * A barre at the lowest fret when it holds 2+ strings and no open or muted string lies
 * between the outer fretted ones. Five or more fretted notes need one; four only when
 * the lowest-fret strings sit side by side (uke B♭ `3 2 1 1`, not guitar `x 2 3 2 3 x`).
 */
export function inferBarres(frets: readonly (number | null)[]): number[] {
  const fretted = frettedFrets(frets);
  if (fretted.length <= 3) return [];
  const min = Math.min(...fretted);
  const first = frets.findIndex((f) => f !== null && f > 0);
  const last = frets.length - 1 - [...frets].reverse().findIndex((f) => f !== null && f > 0);
  const between = frets.slice(first, last + 1);
  if (between.some((f) => f === null || f === 0)) return [];
  const atMin = frets.flatMap((f, i) => (f === min ? [i] : []));
  if (atMin.length < 2) return [];
  const sideBySide = atMin[atMin.length - 1] - atMin[0] === atMin.length - 1;
  return fretted.length > 4 || sideBySide ? [min] : [];
}

/** Fingering with its display position and barre worked out from the frets. */
export function toFingering(frets: (number | null)[]): Fingering {
  const barres = inferBarres(frets);
  return barres.length > 0
    ? { frets, baseFret: displayBaseFret(frets), barres }
    : { frets, baseFret: displayBaseFret(frets) };
}

/** MIDI notes that sound, lowest string first. */
export function fingeringNotes(fingering: Fingering, tuning: readonly number[]): number[] {
  return fingering.frets.flatMap((f, i) => (f === null ? [] : [tuning[i] + f]));
}

export function sameFrets(a: Fingering, b: Fingering): boolean {
  return a.frets.length === b.frets.length && a.frets.every((f, i) => f === b.frets[i]);
}

/** Drop later fingerings that repeat an earlier one. */
export function uniqueFingerings(fingerings: Fingering[]): Fingering[] {
  return fingerings.filter((f, i) => fingerings.findIndex((g) => sameFrets(f, g)) === i);
}

function lowestFret(f: Fingering): number {
  const fretted = frettedFrets(f.frets);
  return fretted.length > 0 ? Math.min(...fretted) : 0;
}

function highestFret(f: Fingering): number {
  const fretted = frettedFrets(f.frets);
  return fretted.length > 0 ? Math.max(...fretted) : 0;
}

export function byPosition(a: Fingering, b: Fingering): number {
  return lowestFret(a) - lowestFret(b);
}

/**
 * Chord tones a voicing must hold when there are fewer strings than notes:
 * the 5th goes first, then the 9th, then the root.
 */
export function requiredIntervals(intervals: readonly number[], strings: number): number[] {
  let required = [...intervals];
  for (const optional of [7, 14, 0]) {
    if (required.length <= strings) break;
    required = required.filter((i) => i !== optional);
  }
  return required;
}

const SEARCH_POSITIONS = 12;
/** Frets a hand covers without shifting */
const HAND_SPAN = 4;

/**
 * Search voicings where every string sounds a chord tone and all required tones are
 * present, within a four-fret hand position (open strings allowed). Starting from
 * `known` voicings, returns up to `limit`, each one further up the neck than the last.
 */
export function searchVoicings(
  tuning: readonly number[],
  root: number,
  intervals: readonly number[],
  limit = 2,
  known: Fingering[] = [],
): Fingering[] {
  const tones = new Set(intervals.map((i) => pitchClass(root + i)));
  const required = requiredIntervals(intervals, tuning.length).map((i) => pitchClass(root + i));
  const found: { frets: number[]; score: number }[] = [];
  const seen = new Set<string>();

  for (let position = 1; position <= SEARCH_POSITIONS; position++) {
    const options = tuning.map((open) => {
      const frets = [0];
      for (let f = position; f < position + HAND_SPAN; f++) frets.push(f);
      return frets.filter((f) => tones.has(pitchClass(open + f)));
    });

    let combos: number[][] = [[]];
    for (const stringOptions of options) {
      combos = combos.flatMap((combo) => stringOptions.map((f) => [...combo, f]));
    }

    for (const frets of combos) {
      const key = frets.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const sounding = new Set(frets.map((f, i) => pitchClass(tuning[i] + f)));
      if (!required.every((pc) => sounding.has(pc))) continue;
      const fretted = frets.filter((f) => f > 0);
      const top = fretted.length > 0 ? Math.max(...fretted) : 0;
      const span = fretted.length > 0 ? top - Math.min(...fretted) : 0;
      // Open strings ringing under a hand up the neck sound and read oddly
      const farOpen = top > HAND_SPAN ? frets.length - fretted.length : 0;
      // Low on the neck first, then fewer fingers, then a compact hand
      found.push({ frets, score: top * 4 + fretted.length * 2 + span + farOpen * 6 });
    }
  }

  found.sort((a, b) => a.score - b.score);
  const picked = [...known];
  for (const { frets } of found) {
    if (picked.length >= limit) break;
    const fingering = toFingering(frets);
    const previous = picked[picked.length - 1];
    const higher =
      !previous ||
      (highestFret(fingering) > highestFret(previous) &&
        lowestFret(fingering) >= lowestFret(previous));
    if (!higher) continue;
    picked.push(fingering);
  }
  return picked;
}
