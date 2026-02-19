import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

interface SortableSongItemProps {
  id: string;
  songTitle?: string;
  children: ReactNode;
}

export function SortableSongItem({ id, songTitle, children }: SortableSongItemProps) {
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
      className="flex items-center gap-2 rounded-sm bg-bg-raised px-2 py-1.5"
    >
      <button
        type="button"
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
