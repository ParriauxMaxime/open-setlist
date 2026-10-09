/**
 * Bass patterns (standard EADG tuning): root, fifth and octave — the box a bassist
 * outlines a chord with. Frets array: [E(4), A(3), D(2), G(1)].
 */

import { byPosition, type Fingering, pitchClass, TUNINGS, toFingering } from "./fretted";
import { parseChord, ROOT_MIDI } from "./theory";

/** Root on the E string, then on the A string, lowest on the neck first. */
const ROOT_STRINGS = [0, 1];
/** Semitones between adjacent strings */
const STRING_STEP = 5;

/**
 * Root + fifth + octave for a chord name. The fifth follows the chord (♭5 for dim,
 * ♯5 for aug). A slash chord gives its bass note and octave only.
 */
export function getBassFingerings(name: string): Fingering[] {
  const chord = parseChord(name);
  if (!chord) return [];
  const note = chord.bass ?? chord.root;
  const fifth = chord.bass ? undefined : (chord.intervals.find((i) => i >= 6 && i <= 8) ?? 7);

  return ROOT_STRINGS.map((rootString) => {
    const rootFret = pitchClass(ROOT_MIDI[note] - TUNINGS.bass[rootString]);
    const frets: (number | null)[] = TUNINGS.bass.map(() => null);
    frets[rootString] = rootFret;
    if (fifth !== undefined) frets[rootString + 1] = rootFret + fifth - STRING_STEP;
    // Two strings up is a minor 7th: two frets higher gives the octave
    frets[rootString + 2] = rootFret + 12 - 2 * STRING_STEP;
    return toFingering(frets);
  }).sort(byPosition);
}
