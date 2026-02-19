import { useTranslation } from "react-i18next";
import type { ActiveDrag } from "../hooks/use-setlist-dnd";

interface DragOverlayContentProps {
  activeDrag: ActiveDrag;
}

export function DragOverlayContent({ activeDrag }: DragOverlayContentProps) {
  const { t } = useTranslation();

  if (activeDrag.type === "set") {
    return (
      <div className="rounded-md border border-accent bg-bg-surface px-4 py-2 text-sm font-medium shadow-lg">
        {activeDrag.setName ?? t("setlist.set")}
      </div>
    );
  }

  // Song or catalog item
  return (
    <div className="rounded-sm border border-accent bg-bg-raised px-3 py-1.5 text-sm shadow-lg">
      {activeDrag.songTitle ?? t("setlist.song")}
    </div>
  );
}
