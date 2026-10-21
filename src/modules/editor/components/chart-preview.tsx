import { type SongDisplayPrefs, songDisplayCssVars } from "@domain/preferences";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ChordProView } from "../../performance/components/chordpro-view";
import { useDebouncedValue } from "../../shared/hooks/use-debounced-value";

const PREVIEW_DELAY_MS = 150;

interface ChartPreviewProps {
  content: string;
  transposition?: number;
  /** Display settings of the song, so the chart reads as on stage. */
  displayPrefs: SongDisplayPrefs;
  className?: string;
}

/** The chart as the stage shows it, following the text being typed. */
export function ChartPreview({
  content,
  transposition,
  displayPrefs,
  className = "",
}: ChartPreviewProps) {
  const { t } = useTranslation();
  const settledContent = useDebouncedValue(content, PREVIEW_DELAY_MS);

  return (
    <section
      aria-label={t("editor.preview")}
      className={`min-h-0 overflow-y-auto rounded-lg border border-border bg-bg px-4 py-4 ${className}`}
      style={songDisplayCssVars(displayPrefs) as CSSProperties}
    >
      <ChordProView content={settledContent} transposition={transposition} />
    </section>
  );
}
