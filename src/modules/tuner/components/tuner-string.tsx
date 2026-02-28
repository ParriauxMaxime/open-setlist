import { useEffect, useRef } from "react";
import type { TuningStatus } from "../hooks/use-active-string";

interface TunerStringProps {
  label: string;
  frequency: number;
  gauge: number;
  active: boolean;
  status: TuningStatus | null;
  cents: number;
  y: number;
  width: number;
}

const STATUS_COLORS: Record<TuningStatus, string> = {
  "in-tune": "var(--color-success)",
  close: "var(--color-warning)",
  off: "var(--color-danger)",
};

const LABEL_X = 30;
const HZ_X_OFFSET = 20;
const STRING_X1 = 55;

export function TunerString({
  label,
  frequency,
  gauge,
  active,
  status,
  cents,
  y,
  width,
}: TunerStringProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef(0);

  const stringX2 = width - 55;
  const stringLen = stringX2 - STRING_X1;
  const strokeWidth = 1 + gauge * 0.6;
  const restColor = "var(--color-text-muted)";
  const activeColor = status ? STATUS_COLORS[status] : restColor;

  // Amplitude: large when off, small when in-tune
  const absCents = Math.abs(cents);
  const amplitude = active ? (absCents < 5 ? 2 : absCents < 15 ? 4 : 7) : 0;

  useEffect(() => {
    if (!active || !pathRef.current) return;

    const el = pathRef.current;
    const speed = 4; // Hz visual vibration speed

    const animate = () => {
      phaseRef.current += speed * 0.016 * Math.PI * 2;
      // Build sine-wave path
      const segments = 40;
      const step = stringLen / segments;
      let d = `M ${STRING_X1} ${y}`;
      for (let i = 1; i <= segments; i++) {
        const x = STRING_X1 + i * step;
        const t = i / segments;
        // Sine envelope (0 at ends, max at center)
        const envelope = Math.sin(t * Math.PI);
        const dy = amplitude * envelope * Math.sin(t * Math.PI * 4 + phaseRef.current);
        d += ` L ${x} ${y + dy}`;
      }
      el.setAttribute("d", d);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, amplitude, stringLen, y]);

  return (
    <g>
      {/* Left label */}
      <text
        x={LABEL_X}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={active ? activeColor : "var(--color-text)"}
        fontSize={14}
        fontWeight={active ? 700 : 400}
      >
        {label}
      </text>

      {/* String line or animated path */}
      {active ? (
        <path
          ref={pathRef}
          d={`M ${STRING_X1} ${y} L ${stringX2} ${y}`}
          fill="none"
          stroke={activeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={STRING_X1}
          y1={y}
          x2={stringX2}
          y2={y}
          stroke={restColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.5}
        />
      )}

      {/* Right label — target Hz */}
      <text
        x={width - HZ_X_OFFSET}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text-muted)"
        fontSize={11}
      >
        {frequency.toFixed(0)}
      </text>
    </g>
  );
}
