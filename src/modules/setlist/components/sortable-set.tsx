import type { SetlistSet } from "@db";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type RemovedSong, SetEditor } from "./set-editor";

export interface SetDragHandleProps {
  dragAttributes: DraggableAttributes;
  dragListeners: SyntheticListenerMap | undefined;
}

interface SortableSetProps {
  id: string;
  setName: string;
  set: SetlistSet;
  setIndex: number;
  allSets: readonly SetlistSet[];
  songDragIds: string[];
  onUpdate: (set: SetlistSet) => void;
  onRemove: () => void;
  canRemove: boolean;
  removed?: RemovedSong;
  onSongRemoved: (removed: RemovedSong) => void;
  onUndoRemove: () => void;
}

export function SortableSet({
  id,
  setName,
  set,
  setIndex,
  allSets,
  songDragIds,
  onUpdate,
  onRemove,
  canRemove,
  removed,
  onSongRemoved,
  onUndoRemove,
}: SortableSetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { setName },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SetEditor
        set={set}
        setIndex={setIndex}
        allSets={allSets}
        songDragIds={songDragIds}
        onUpdate={onUpdate}
        onRemove={onRemove}
        canRemove={canRemove}
        removed={removed}
        onSongRemoved={onSongRemoved}
        onUndoRemove={onUndoRemove}
        dragHandle={{ dragAttributes: attributes, dragListeners: listeners }}
      />
    </div>
  );
}
