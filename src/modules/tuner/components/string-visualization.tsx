import type { InstrumentTuning } from "../../../domain/tunings";
import type { ActiveStringResult } from "../hooks/use-active-string";
import { TunerString } from "./tuner-string";

interface StringVisualizationProps {
  tuning: InstrumentTuning;
  activeString: ActiveStringResult | null;
}

const SVG_WIDTH = 340;
const PADDING_Y = 24;
const STRING_SPACING = 32;

export function StringVisualization({ tuning, activeString }: StringVisualizationProps) {
  const stringCount = tuning.strings.length;
  const svgHeight = PADDING_Y * 2 + (stringCount - 1) * STRING_SPACING;

  return (
    <svg
      viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      className="w-full max-w-sm"
      role="img"
      aria-label="String tuning"
    >
      {tuning.strings.map((s, i) => {
        const isActive = activeString?.stringIndex === i;
        return (
          <TunerString
            key={s.note}
            label={s.label}
            frequency={s.frequency}
            gauge={s.gauge}
            active={isActive}
            status={isActive ? activeString.status : null}
            cents={isActive ? activeString.centsFromTarget : 0}
            y={PADDING_Y + i * STRING_SPACING}
            width={SVG_WIDTH}
          />
        );
      })}
    </svg>
  );
}
