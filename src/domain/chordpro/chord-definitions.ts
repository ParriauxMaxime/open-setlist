/**
 * `{define}` / `{chord}` directive values:
 *
 *   {define: Bm base-fret 2 frets x 1 3 3 2 1 fingers 0 1 3 4 2 1}
 *
 * Frets are relative to `base-fret` (1 = the base fret), one per string, lowest string
 * first; `x`, `N` or `-1` mute a string. `fingers` is optional. Other ChordPro
 * attributes (`keys`, `display`, `format`, `copy`…) are accepted and ignored.
 */

export interface ChordDefinition {
  name: string;
  /** Fret the diagram starts at (1 = the nut) */
  baseFret: number;
  /** As written: relative to `baseFret`, null = muted, 0 = open */
  frets: (number | null)[];
  /** One per string, 0 = no finger */
  fingers?: number[];
  /** `{chord}`: a diagram shown in place, not a song-wide definition */
  inline?: boolean;
}

const MAX_FRET = 24;
const MAX_STRINGS = 12;

type Attribute = "base-fret" | "frets" | "fingers" | "ignored";

const ATTRIBUTES: Record<string, Attribute> = {
  "base-fret": "base-fret",
  frets: "frets",
  fingers: "fingers",
  keys: "ignored",
  display: "ignored",
  format: "ignored",
  copy: "ignored",
  copyall: "ignored",
  diagram: "ignored",
};

const MUTED_RE = /^(?:x|n|-1)$/i;
const NUMBER_RE = /^\d+$/;

/** A fret: number, null when muted, undefined when not a fret at all. */
function readFret(token: string): number | null | undefined {
  if (MUTED_RE.test(token)) return null;
  if (!NUMBER_RE.test(token)) return undefined;
  const fret = Number(token);
  return fret <= MAX_FRET ? fret : undefined;
}

/** A finger: 1–5, 0 / x / N / - for none, undefined when not a finger. */
function readFinger(token: string): number | undefined {
  if (MUTED_RE.test(token) || token === "-") return 0;
  return /^[0-5]$/.test(token) ? Number(token) : undefined;
}

/** Parse a `{define}` / `{chord}` value. Returns null when it has no usable frets. */
export function parseChordDefinition(value: string): ChordDefinition | null {
  const [name, ...tokens] = value.trim().split(/\s+/);
  if (!name || ATTRIBUTES[name.toLowerCase()]) return null;

  let baseFret = 1;
  const frets: (number | null)[] = [];
  const fingers: number[] = [];
  let fingersValid = true;
  let attribute: Attribute | undefined;

  for (const token of tokens) {
    const next = ATTRIBUTES[token.toLowerCase()];
    if (next) {
      attribute = next;
      continue;
    }
    if (attribute === "base-fret") {
      if (!NUMBER_RE.test(token)) return null;
      baseFret = Number(token);
      if (baseFret < 1 || baseFret > MAX_FRET) return null;
      attribute = undefined;
    } else if (attribute === "frets") {
      const fret = readFret(token);
      if (fret === undefined) return null;
      frets.push(fret);
    } else if (attribute === "fingers") {
      const finger = readFinger(token);
      if (finger === undefined) fingersValid = false;
      else fingers.push(finger);
    } else if (attribute !== "ignored") {
      // A value with no attribute before it
      return null;
    }
  }

  if (frets.length === 0 || frets.length > MAX_STRINGS) return null;
  if (frets.every((f) => f === null)) return null;
  const definition: ChordDefinition = { name, baseFret, frets };
  if (fingersValid && fingers.length === frets.length) definition.fingers = fingers;
  return definition;
}
