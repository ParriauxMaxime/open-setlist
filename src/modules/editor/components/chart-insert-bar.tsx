import {
  CHART_INSERT_LIST,
  type ChartInsert,
  INLINE_INSERTS,
  SECTION_INSERTS,
} from "@domain/chordpro/insert";
import { useTranslation } from "react-i18next";
import { ToolbarMenu } from "../../design-system/components/toolbar-menu";

interface ChartInsertBarProps {
  onInsert: (insert: ChartInsert) => void;
}

const GLYPHS: Record<ChartInsert, string> = {
  verse: "¶",
  chorus: "↻",
  bridge: "⤳",
  comment: "💬",
  chord: "[ ]",
};

/**
 * Section, comment and chord inserts for writing a chart without the braces on a touch
 * keyboard: buttons when the frame is wide, one menu on a phone.
 */
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
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
      >
        <span
          className="w-5 whitespace-nowrap text-center font-mono text-sm text-text-muted"
          aria-hidden="true"
        >
          {GLYPHS[insert]}
        </span>
        {t(`editor.insert.${insert}`)}
      </button>
    ));
  return (
    <>
      <div className="@lg:hidden">
        <ToolbarMenu
          label={t("editor.insert.label")}
          trigger={<>{t("editor.insert.menu")} ▾</>}
          triggerClassName="inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
          align="left"
          keepFocus
          items={CHART_INSERT_LIST.map((insert) => ({
            label: `${GLYPHS[insert]}  ${t(`editor.insert.${insert}`)}`,
            onClick: () => onInsert(insert),
          }))}
        />
      </div>
      <div
        role="toolbar"
        aria-label={t("editor.insert.label")}
        className="hidden flex-wrap items-center @lg:flex"
      >
        {group(SECTION_INSERTS)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {group(INLINE_INSERTS)}
      </div>
    </>
  );
}
