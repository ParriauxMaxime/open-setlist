import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface SortableSongItemProps {
  id: string;
  songTitle?: string;
  children: ReactNode;
  /** Under the row, full width (the setlist's tech note). */
  below?: ReactNode;
}

export function SortableSongItem({ id, songTitle, children, below }: SortableSongItemProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { songTitle },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style} className="bg-bg-surface py-1 pr-1 pl-0.5 hover:bg-bg-hover">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("a11y.dragToReorder")}
          className="flex size-10 shrink-0 cursor-grab touch-none items-center justify-center text-text-faint hover:text-text active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        {children}
      </div>
      {below}
    </li>
  );
}
