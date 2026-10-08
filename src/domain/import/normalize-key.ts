import { CHROMATIC_ROOTS } from "../chords/theory";
import { MUSICAL_KEY_LIST } from "../music";

const SOLFEGE_TO_LETTER: Record<string, string> = {
  do: "C",
  re: "D",
  mi: "E",
  fa: "F",
  sol: "G",
  la: "A",
  si: "B",
};

const LETTER_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const KEY_RE = /^(do|re|mi|fa|sol|la|si|[a-g])([#b]?)(m|min|mineur|minor)?$/;

/** Lowercase, strip accents/whitespace, and map ♭/♯ to b/#. */
function simplify(raw: string): string {
  return raw
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Normalize a key written in letter or French solfège notation onto MUSICAL_KEY_LIST.
 * "RÉm" → "Dm", "LA♭m" → "Abm", "B♭" → "Bb", "SOL#m" → "G#m".
 * Spellings missing from the list (Cb, Fb, E#, B#) map to their enharmonic.
 * Returns undefined if the input cannot be parsed.
 */
export function normalizeKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = simplify(raw).match(KEY_RE);
  if (!match) return undefined;

  const [, rootRaw, accidental, minorSuffix] = match;
  const letter = SOLFEGE_TO_LETTER[rootRaw] ?? rootRaw.toUpperCase();
  const suffix = minorSuffix ? "m" : "";

  const direct = `${letter}${accidental}${suffix}`;
  if (MUSICAL_KEY_LIST.includes(direct)) return direct;

  const offset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  const pitchClass = (LETTER_PITCH[letter] + offset + 12) % 12;
  const enharmonic = `${CHROMATIC_ROOTS[pitchClass]}${suffix}`;
  return MUSICAL_KEY_LIST.includes(enharmonic) ? enharmonic : undefined;
}
