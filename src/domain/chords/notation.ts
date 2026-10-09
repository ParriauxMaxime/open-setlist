/**
 * Chord notation: how note names are shown on screen (per device, display only).
 *
 * Stored ChordPro content always stays in English letters. Only the root and the slash
 * bass are renamed; quality and extensions are kept (`F#m7b5/C#` → `Fa#m7b5/Do#`).
 */

import { normalizeKey } from "../import/normalize-key";

export const NOTATIONS = {
  english: "english",
  solfege: "solfege",
  german: "german",
} as const;

export type Notation = (typeof NOTATIONS)[keyof typeof NOTATIONS];

export const NOTATION_LIST: Notation[] = Object.values(NOTATIONS);

const SOLFEGE: Record<string, string> = {
  C: "Do",
  D: "Ré",
  E: "Mi",
  F: "Fa",
  G: "Sol",
  A: "La",
  B: "Si",
};

const ROOT_RE = /^([A-G])([#b]?)/;
const BASS_RE = /\/([A-G])([#b]?)$/;
/** Quality / extension tokens. Anything else means "not a chord" (`Bridge`, `Hold`). */
const SUFFIX_RE = /^(?:maj|Maj|min|mi|dim|aug|sus|add|alt|omit|no|m|M|[0-9#b+\-°øΔ()/,])*$/;

function formatNote(letter: string, accidental: string, notation: Notation): string {
  if (notation === "solfege") return SOLFEGE[letter] + accidental;
  // German: B natural is H, Bb is B.
  if (notation === "german" && letter === "B") return accidental === "b" ? "B" : `H${accidental}`;
  return letter + accidental;
}

/**
 * Display a chord in the given notation. Annotations (`*N.C.`) and anything that does not
 * parse as a chord are returned unchanged.
 */
export function formatChord(chord: string, notation: Notation): string {
  if (notation === "english") return chord;

  const bass = chord.match(BASS_RE);
  const main = bass ? chord.slice(0, bass.index) : chord;
  const root = main.match(ROOT_RE);
  if (!root) return chord;
  const suffix = main.slice(root[0].length);
  if (!SUFFIX_RE.test(suffix)) return chord;

  const formatted = formatNote(root[1], root[2], notation) + suffix;
  return bass ? `${formatted}/${formatNote(bass[1], bass[2], notation)}` : formatted;
}

/**
 * Display a song key in the given notation. Accepts solfège input too
 * (`RÉm` → `Dm` in English, `Rém` in solfège). Unparseable keys are returned unchanged.
 */
export function formatKey(key: string, notation: Notation): string {
  return formatChord(normalizeKey(key) ?? key, notation);
}

/** An instrument's pitch the way players name it, with a flat sign: "B♭", "Si♭", "Fa". */
export function formatPitch(pitch: string, notation: Notation): string {
  return formatChord(pitch, notation).replace(/b$/, "♭");
}
