import { formatPitch } from "@domain/chords/notation";
import { INSTRUMENT_PITCH, partPitch } from "@domain/parts";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { partLabel } from "../../performance/components/my-part-menu";
import { useNotation } from "../../shared/hooks/use-notation";

/** A part's name, with its pitch when it transposes: "🎺 Trumpet (B♭)", "🎸 Guitar". */
export function usePartName(): (part: string, emoji?: boolean) => string {
  const { t } = useTranslation();
  const notation = useNotation();
  return useCallback(
    (part: string, emoji = true) => {
      const name = partLabel(part, t, emoji);
      const pitch = partPitch(part);
      return pitch === INSTRUMENT_PITCH.concert
        ? name
        : t("print.partWithPitch", { part: name, pitch: formatPitch(pitch, notation) });
    },
    [t, notation],
  );
}
