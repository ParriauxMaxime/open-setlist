import { type ChartInsert, INLINE_INSERTS, SECTION_INSERTS } from "@domain/chordpro/insert";
import { useTranslation } from "react-i18next";

interface ChartInsertBarProps {
  onInsert: (insert: ChartInsert) => void;
}

const GLYPHS: Record<ChartInsert, string> = {
  verse: "¶",
  chorus: "↻",
  bridge: "⤳",
  comment: "💬",
  chord: "[ ]",
};

/** Section, comment and chord buttons for writing a chart without the braces on a touch keyboard. */
export function ChartInsertBar({ onInsert }: ChartInsertBarProps) {
  const { t } = useTranslation();
  const group = (inserts: readonly ChartInsert[]) =>
    inserts.map((insert) => (
      <button
        key={insert}
        type="button"
        // Keeps the textarea's focus and selection, and the touch keyboard open
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onInsert(insert)}
        title={t(`editor.insert.${insert}`)}
        aria-label={t(`editor.insert.${insert}`)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text @lg:px-2.5"
      >
        <span className="w-5 text-center font-mono text-sm text-text-muted" aria-hidden="true">
          {GLYPHS[insert]}
        </span>
        {/* The label fits only when the editor is wide enough */}
        <span className="hidden @lg:inline">{t(`editor.insert.${insert}`)}</span>
      </button>
    ));
  return (
    <div
      role="toolbar"
      aria-label={t("editor.insert.label")}
      className="flex flex-wrap items-center"
    >
      {group(SECTION_INSERTS)}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      {group(INLINE_INSERTS)}
    </div>
  );
}
