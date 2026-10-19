import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface SortableSongItemProps {
  id: string;
  songTitle?: string;
  children: ReactNode;
}

export function SortableSongItem({ id, songTitle, children }: SortableSongItemProps) {
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
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-bg-surface px-3 py-2 hover:bg-bg-hover"
    >
      <button
        type="button"
        aria-label={t("a11y.dragToReorder")}
        className="cursor-grab touch-none px-0.5 text-text-faint hover:text-text active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </li>
  );
}
