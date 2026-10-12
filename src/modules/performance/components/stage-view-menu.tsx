import type { SongAttachment } from "@db";
import { CHART_VIEW } from "@domain/attachments";
import { useTranslation } from "react-i18next";
import { choiceClass, partLabel } from "./my-part-menu";

interface StageViewMenuProps {
  attachments: SongAttachment[];
  /** Id of the sheet shown; undefined = the chart. */
  current: string | undefined;
  onChange: (view: string) => void;
}

/** Chart or sheet music: what this musician reads for the song (perform header ⋮ menu). */
export function StageViewMenu({ attachments, current, onChange }: StageViewMenuProps) {
  const { t } = useTranslation();
  const views = [
    { id: CHART_VIEW, label: t("attachments.chartView"), selected: current === undefined },
    ...attachments.map((a) => ({
      id: a.id,
      label: `📄 ${a.part ? partLabel(a.part, t, false) : a.name}`,
      selected: current === a.id,
    })),
  ];

  return (
    <div className="w-72 border-b border-border px-4 pt-2 pb-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
        {t("attachments.viewTitle")}
      </div>
      <div className="flex flex-wrap gap-2">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-pressed={view.selected}
            onClick={() => onChange(view.id)}
            className={`${choiceClass(view.selected)} max-w-full truncate`}
          >
            {view.label}
          </button>
        ))}
      </div>
    </div>
  );
}
