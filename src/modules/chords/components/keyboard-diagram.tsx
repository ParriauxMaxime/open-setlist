/**
 * SVG piano keyboard diagram for chord visualization.
 *
 * Renders a 2-octave keyboard (C4–B5) with highlighted keys
 * for the chord's MIDI notes. Accent color for active keys.
 */

interface KeyboardDiagramProps {
  name: string;
  midi: number[];
  width?: number;
}

/** MIDI range: C4 (60) to B5 (83) = 2 octaves, 14 white keys */
const MIDI_START = 60;
const MIDI_END = 83;
const WHITE_KEYS_COUNT = 14;

/** Map note-in-octave (0–11) to white key index within that octave, or -1 for black */
const WHITE_INDEX = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6];

/** For black keys: position as fractional white-key index within the octave */
const BLACK_POS: Record<number, number> = {
  1: 0.5,
  3: 1.5,
  6: 3.5,
  8: 4.5,
  10: 5.5,
};

function isBlack(midi: number): boolean {
  const n = midi % 12;
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
}

function whiteKeyIndex(midi: number): number {
  const octave = Math.floor((midi - MIDI_START) / 12);
  return octave * 7 + WHITE_INDEX[midi % 12];
}

function blackKeyX(midi: number, keyW: number, blackW: number): number {
  const octave = Math.floor((midi - MIDI_START) / 12);
  const pos = octave * 7 + BLACK_POS[midi % 12];
  return pos * keyW - blackW / 2 + keyW / 2;
}

export function KeyboardDiagram({ name, midi, width = 120 }: KeyboardDiagramProps) {
  const activeSet = new Set(midi);

  const keyW = width / WHITE_KEYS_COUNT;
  const keyH = width * 0.5;
  const blackW = keyW * 0.65;
  const blackH = keyH * 0.6;
  const topPad = width * 0.22;
  const totalHeight = topPad + keyH + 2;

  // Build key arrays
  const whites: { midi: number; x: number }[] = [];
  const blacks: { midi: number; x: number }[] = [];

  for (let m = MIDI_START; m <= MIDI_END; m++) {
    if (isBlack(m)) {
      blacks.push({ midi: m, x: blackKeyX(m, keyW, blackW) });
    } else {
      whites.push({ midi: m, x: whiteKeyIndex(m) * keyW });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${totalHeight}`}
      width={width}
      height={totalHeight}
      role="img"
      aria-label={`${name} chord diagram`}
    >
      {/* Chord name */}
      <text
        x={width / 2}
        y={topPad - 6}
        textAnchor="middle"
        fontSize={width * 0.11}
        fontWeight="bold"
        fill="currentColor"
        fontFamily="inherit"
      >
        {name}
      </text>

      {/* White keys (drawn first, behind black keys) */}
      {whites.map((k) => (
        <rect
          key={`w${k.midi}`}
          x={k.x + 0.5}
          y={topPad}
          width={keyW - 1}
          height={keyH}
          rx={1}
          fill={
            activeSet.has(k.midi) ? "var(--color-chord, #f0a050)" : "var(--color-bg-white, #f8f8f8)"
          }
          stroke="var(--color-border, #2a2a2a)"
          strokeWidth={0.5}
        />
      ))}

      {/* Black keys (on top of white keys) */}
      {blacks.map((k) => (
        <rect
          key={`b${k.midi}`}
          x={k.x}
          y={topPad}
          width={blackW}
          height={blackH}
          rx={1}
          fill={
            activeSet.has(k.midi) ? "var(--color-chord, #f0a050)" : "var(--color-bg-black, #1a1a1a)"
          }
          stroke="var(--color-border, #2a2a2a)"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}
