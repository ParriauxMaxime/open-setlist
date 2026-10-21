import { CHART_INSERT_LIST, type ChartInsert } from "@domain/chordpro/insert";
import { useTranslation } from "react-i18next";

interface ChartInsertBarProps {
  onInsert: (insert: ChartInsert) => void;
}

/** Section, comment and chord buttons for writing a chart without the braces on a touch keyboard. */
export function ChartInsertBar({ onInsert }: ChartInsertBarProps) {
  const { t } = useTranslation();
  return (
    <div role="toolbar" aria-label={t("editor.insert.label")} className="flex flex-wrap gap-1">
      {CHART_INSERT_LIST.map((insert) => (
        <button
          key={insert}
          type="button"
          // Keeps the textarea's focus and selection, and the touch keyboard open
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onInsert(insert)}
          className="btn btn-outline btn-sm"
        >
          {t(`editor.insert.${insert}`)}
        </button>
      ))}
    </div>
  );
}
