interface TunerGaugeProps {
  cents: number | null;
}

const TICKS = [-50, -25, 0, 25, 50];
const RADIUS = 120;
const CX = 150;
const CY = 150;

function centsToAngle(cents: number): number {
  // Map -50..+50 to -90..+90 degrees
  const clamped = Math.max(-50, Math.min(50, cents));
  return (clamped / 50) * 90;
}

function polarToXY(angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + RADIUS * Math.cos(rad), y: CY + RADIUS * Math.sin(rad) };
}

function centsColor(cents: number | null): string {
  if (cents == null) return "var(--color-text-muted)";
  const abs = Math.abs(cents);
  if (abs < 5) return "var(--color-success)";
  if (abs < 15) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function TunerGauge({ cents }: TunerGaugeProps) {
  const active = cents != null;
  const angle = active ? centsToAngle(cents) : 0;

  // In-tune arc: ±5 cents → ±9° around center
  const zoneStart = polarToXY(-9);
  const zoneEnd = polarToXY(9);

  return (
    <svg
      viewBox="0 0 300 180"
      className="w-full max-w-xs"
      role="img"
      aria-label={
        active ? `Tuner gauge: ${cents > 0 ? "+" : ""}${cents} cents` : "Tuner gauge: inactive"
      }
    >
      {/* Background arc */}
      <path
        d={`M ${polarToXY(-90).x} ${polarToXY(-90).y} A ${RADIUS} ${RADIUS} 0 1 1 ${polarToXY(90).x} ${polarToXY(90).y}`}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={4}
      />

      {/* In-tune zone */}
      {active && (
        <path
          d={`M ${zoneStart.x} ${zoneStart.y} A ${RADIUS} ${RADIUS} 0 0 1 ${zoneEnd.x} ${zoneEnd.y}`}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth={6}
          opacity={0.5}
        />
      )}

      {/* Tick marks and labels */}
      {TICKS.map((tick) => {
        const angleDeg = (tick / 50) * 90;
        const outer = polarToXY(angleDeg);
        const rad = ((angleDeg - 90) * Math.PI) / 180;
        const inner = {
          x: CX + (RADIUS - 10) * Math.cos(rad),
          y: CY + (RADIUS - 10) * Math.sin(rad),
        };
        const label = {
          x: CX + (RADIUS + 16) * Math.cos(rad),
          y: CY + (RADIUS + 16) * Math.sin(rad),
        };
        return (
          <g key={tick}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--color-text-muted)"
              strokeWidth={tick === 0 ? 2 : 1}
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-text-muted)"
              fontSize={10}
            >
              {tick === 0 ? "0" : tick > 0 ? `+${tick}` : tick}
            </text>
          </g>
        );
      })}

      {/* Needle */}
      <line
        x1={CX}
        y1={CY}
        x2={CX}
        y2={CY - RADIUS + 15}
        stroke={centsColor(cents)}
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: `rotate(${angle}deg)`,
          transition: active ? "transform 0.1s ease-out" : "none",
        }}
      />

      {/* Center dot */}
      <circle cx={CX} cy={CY} r={5} fill={centsColor(cents)} />
    </svg>
  );
}
