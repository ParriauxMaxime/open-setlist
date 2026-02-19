/**
 * SVG chord diagram for fretted string instruments (guitar, bass, ukulele).
 *
 * Renders a standard chord box: vertical strings, horizontal frets,
 * finger dots, barre bars, open/muted indicators, and position label.
 */

interface FretboardDiagramProps {
  name: string;
  frets: (number | null)[];
  baseFret?: number;
  barres?: number[];
  fretCount?: number;
  width?: number;
}

// String names used as stable keys (low E to high E for 6-string)
const STRING_KEYS = ["6E", "5A", "4D", "3G", "2B", "1e"];

export function FretboardDiagram({
  name,
  frets,
  baseFret = 1,
  barres = [],
  fretCount = 4,
  width = 80,
}: FretboardDiagramProps) {
  const stringCount = frets.length;
  const strings = stringCount - 1;

  // Layout ratios (relative to width)
  const sidePad = width * 0.15;
  const topPad = width * 0.38;
  const neckWidth = width - sidePad * 2;
  const stringSpacing = neckWidth / strings;
  const fretHeight = stringSpacing * 1.4;
  const neckHeight = fretCount * fretHeight;
  const dotRadius = stringSpacing * 0.3;
  const indicatorY = topPad - dotRadius * 1.8;
  const nutWidth = 2.5;
  const totalHeight = topPad + neckHeight + width * 0.05;

  const stringX = (i: number) => sidePad + i * stringSpacing;
  const fretY = (f: number) => topPad + f * fretHeight;
  const dotY = (f: number) => fretY(f) - fretHeight / 2;
  const visualFret = (fret: number) => fret - baseFret + 1;

  // Pre-compute barre spans for hit-testing
  const barreSpans = barres.map((barreFret) => {
    const vf = visualFret(barreFret);
    const covered = frets
      .map((f, i) => (f !== null && f >= barreFret ? i : -1))
      .filter((i) => i >= 0);
    return { fret: barreFret, vf, first: covered[0], last: covered[covered.length - 1], covered };
  });

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
        y={topPad - dotRadius * 4}
        textAnchor="middle"
        fontSize={width * 0.15}
        fontWeight="bold"
        fill="currentColor"
        fontFamily="inherit"
      >
        {name}
      </text>

      {/* Nut (thick bar) or position label */}
      {baseFret === 1 ? (
        <rect
          x={sidePad - 0.5}
          y={topPad - nutWidth}
          width={neckWidth + 1}
          height={nutWidth}
          fill="currentColor"
          rx={0.5}
        />
      ) : (
        <text
          x={sidePad - dotRadius * 0.8}
          y={dotY(1) + dotRadius * 0.4}
          textAnchor="end"
          fontSize={width * 0.11}
          fill="var(--color-text-muted, #888)"
          fontFamily="inherit"
        >
          {baseFret}
        </text>
      )}

      {/* Fret lines */}
      {Array.from({ length: fretCount + 1 }, (_, f) => (
        <line
          key={`fr${baseFret + f}`}
          x1={sidePad}
          y1={fretY(f)}
          x2={sidePad + neckWidth}
          y2={fretY(f)}
          stroke="var(--color-border, #2a2a2a)"
          strokeWidth={f === 0 && baseFret > 1 ? 1 : 0.8}
        />
      ))}

      {/* String lines */}
      {frets.map((_, i) => (
        <line
          key={`s${STRING_KEYS[i] ?? i}`}
          x1={stringX(i)}
          y1={topPad}
          x2={stringX(i)}
          y2={topPad + neckHeight}
          stroke="var(--color-text-faint, #555)"
          strokeWidth={0.8}
        />
      ))}

      {/* Open (o) and muted (x) indicators */}
      {frets.map((fret, i) => {
        const sk = STRING_KEYS[i] ?? i;
        const x = stringX(i);
        const r = dotRadius * 0.7;
        if (fret === 0) {
          return (
            <circle
              key={`o${sk}`}
              cx={x}
              cy={indicatorY}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
            />
          );
        }
        if (fret === null) {
          return (
            <text
              key={`m${sk}`}
              x={x}
              y={indicatorY + r * 0.4}
              textAnchor="middle"
              fontSize={r * 2.2}
              fill="var(--color-text-muted, #888)"
              fontFamily="inherit"
            >
              x
            </text>
          );
        }
        return null;
      })}

      {/* Barre bars */}
      {barreSpans.map(({ fret: barreFret, vf, first, last, covered }) => {
        if (vf < 1 || vf > fretCount || covered.length < 2) return null;
        const y = dotY(vf);
        const barreHeight = dotRadius * 1.6;
        return (
          <rect
            key={`bar${barreFret}`}
            x={stringX(first)}
            y={y - barreHeight / 2}
            width={stringX(last) - stringX(first)}
            height={barreHeight}
            rx={barreHeight / 2}
            fill="var(--color-chord, #f0a050)"
          />
        );
      })}

      {/* Finger dots */}
      {frets.map((fret, i) => {
        if (fret === null || fret === 0) return null;
        const vf = visualFret(fret);
        if (vf < 1 || vf > fretCount) return null;

        const span = barreSpans.find((b) => b.fret === fret);
        if (span && i >= span.first && i <= span.last) return null;

        return (
          <circle
            key={`d${STRING_KEYS[i] ?? i}`}
            cx={stringX(i)}
            cy={dotY(vf)}
            r={dotRadius}
            fill="var(--color-chord, #f0a050)"
          />
        );
      })}
    </svg>
  );
}
