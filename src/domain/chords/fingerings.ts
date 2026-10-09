/**
 * Chord diagrams per fretted instrument, and the song's own `{define}` voicings.
 */

import type { ChordDefinition } from "../chordpro/chord-definitions";
import { getBassFingerings } from "./bass";
import { type Fingering, inferBarres, TUNINGS } from "./fretted";
import { getGuitarFingerings } from "./guitar";
import { parseChord, ROOT_MIDI } from "./theory";
import type { FrettedInstrument } from "./types";
import { getUkuleleFingerings } from "./ukulele";

/** Built-in fingerings for a chord name, best first. */
export function getFingerings(instrument: FrettedInstrument, chord: string): Fingering[] {
  switch (instrument) {
    case "guitar":
      return getGuitarFingerings(chord);
    case "ukulele":
      return getUkuleleFingerings(chord);
    case "bass":
      return getBassFingerings(chord);
  }
}

/** Same chord, spelled alike or not: `Db` = `C#`, `Cmaj7` = `CΔ7`, `Am/C` = `Amin/C`. */
export function sameChord(a: string, b: string): boolean {
  if (a === b) return true;
  const x = parseChord(a);
  const y = parseChord(b);
  if (!x || !y) return false;
  const pc = (note: string | undefined) => (note === undefined ? -1 : ROOT_MIDI[note] % 12);
  return pc(x.root) === pc(y.root) && x.qualityId === y.qualityId && pc(x.bass) === pc(y.bass);
}

/**
 * Instrument a definition is written for, from its string count: 6 → guitar,
 * 4 → ukulele (4-string defines are uke charts far more often than bass).
 */
export function definitionInstrument(definition: ChordDefinition): FrettedInstrument | undefined {
  const strings = definition.frets.length;
  return (Object.keys(TUNINGS) as FrettedInstrument[]).find(
    (instrument) => instrument !== "bass" && TUNINGS[instrument].length === strings,
  );
}

/** Barres from the fingers: one finger on 2+ strings at the same fret. */
function fingerBarres(frets: (number | null)[], fingers: number[]): number[] {
  const barres = new Set<number>();
  fingers.forEach((finger, i) => {
    const fret = frets[i];
    if (finger === 0 || fret === null || fret === 0) return;
    const shared = fingers.some((other, j) => j !== i && other === finger && frets[j] === fret);
    if (shared) barres.add(fret);
  });
  return [...barres];
}

/** A definition as a diagram fingering (absolute frets). */
export function definitionFingering(definition: ChordDefinition): Fingering {
  const { baseFret } = definition;
  const frets = definition.frets.map((f) => (f === null || f === 0 ? f : f + baseFret - 1));
  const barres = definition.fingers ? fingerBarres(frets, definition.fingers) : inferBarres(frets);
  return barres.length > 0 ? { frets, baseFret, barres } : { frets, baseFret };
}

/**
 * The song's `{define}` voicings of this chord for this instrument, last one first
 * (a later define overrides an earlier one). `{chord}` diagrams don't count.
 */
export function definedFingerings(
  definitions: readonly ChordDefinition[],
  instrument: FrettedInstrument,
  chord: string,
): Fingering[] {
  return definitions
    .filter((d) => !d.inline && definitionInstrument(d) === instrument && sameChord(d.name, chord))
    .reverse()
    .map(definitionFingering);
}
