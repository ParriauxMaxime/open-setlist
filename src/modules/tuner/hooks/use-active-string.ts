import { useMemo } from "react";
import type { InstrumentTuning } from "../../../domain/tunings";

export type TuningStatus = "in-tune" | "close" | "off";

export interface ActiveStringResult {
  stringIndex: number;
  centsFromTarget: number;
  status: TuningStatus;
}

function getStatus(cents: number): TuningStatus {
  const abs = Math.abs(cents);
  if (abs < 5) return "in-tune";
  if (abs < 15) return "close";
  return "off";
}

export function useActiveString(
  detectedNote: string | null,
  detectedCents: number | null,
  tuning: InstrumentTuning | null,
): ActiveStringResult | null {
  return useMemo(() => {
    if (!tuning || !detectedNote || detectedCents == null) return null;

    const idx = tuning.strings.findIndex((s) => s.note === detectedNote);
    if (idx === -1) return null;

    return {
      stringIndex: idx,
      centsFromTarget: detectedCents,
      status: getStatus(detectedCents),
    };
  }, [tuning, detectedNote, detectedCents]);
}
