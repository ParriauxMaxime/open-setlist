import type { SetlistSet } from "@db";
import { useDb } from "@db/provider";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildSetDragId } from "../hooks/use-setlist-dnd";
import { SongPicker } from "./song-picker";
import { SongRowContent } from "./song-row-content";
import type { SetDragHandleProps } from "./sortable-set";
import { SortableSongItem } from "./sortable-song-item";

interface SetEditorProps {
  set: SetlistSet;
  setIndex: number;
  songDragIds: string[];
  onUpdate: (set: SetlistSet) => void;
  onRemove: () => void;
  canRemove: boolean;
  dragHandle?: SetDragHandleProps;
}

export function SetEditor({
  set,
  setIndex,
  songDragIds,
  onUpdate,
  onRemove,
  canRemove,
  dragHandle,
}: SetEditorProps) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);

  // Make the set container a droppable target for catalog items
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: buildSetDragId(setIndex),
    data: { setName: set.name },
  });

  const db = useDb();

  // Resolve song IDs to song objects for display
  const songs = useLiveQuery(async () => {
    if (set.songIds.length === 0) return [];
    const all = await db.songs.bulkGet(set.songIds);
    return all;
  }, [set.songIds, db]);

  const addSong = (songId: string) => {
    onUpdate({ ...set, songIds: [...set.songIds, songId] });
    setShowPicker(false);
  };

  const removeSong = (index: number) => {
    const next = [...set.songIds];
    next.splice(index, 1);
    onUpdate({ ...set, songIds: next });
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= set.songIds.length) return;
    const next = [...set.songIds];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdate({ ...set, songIds: next });
  };

  return (
    <div ref={setDroppableRef} className="rounded-md border border-border bg-bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {dragHandle && (
            <button
              type="button"
              className="cursor-grab touch-none text-lg text-text-faint hover:text-text active:cursor-grabbing"
              {...dragHandle.dragAttributes}
              {...dragHandle.dragListeners}
            >
              ⠿
            </button>
          )}
          <input
            type="text"
            value={set.name}
            onChange={(e) => onUpdate({ ...set, name: e.target.value })}
            className="field max-w-48 font-medium"
          />
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="btn-danger text-sm">
            {t("setlist.removeSet")}
          </button>
        )}
      </div>

      {set.songIds.length === 0 ? (
        <p className="py-2 text-sm text-text-faint">{t("setlist.noSongsInSet")}</p>
      ) : (
        <SortableContext items={songDragIds} strategy={verticalListSortingStrategy}>
          <ol className="mb-2 flex flex-col gap-1">
            {set.songIds.map((songId, i) => {
              const song = songs?.find((s) => s?.id === songId);
              const dragId = songDragIds[i];
              return (
                <SortableSongItem key={dragId} id={dragId} songTitle={song?.title}>
                  <span className="w-5 text-center text-xs text-text-faint">{i + 1}</span>
                  <SongRowContent song={song} />
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => moveSong(i, -1)}
                      disabled={i === 0}
                      className="px-1 text-text-faint hover:text-text disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSong(i, 1)}
                      disabled={i === set.songIds.length - 1}
                      className="px-1 text-text-faint hover:text-text disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSong(i)}
                      className="px-1 text-text-faint hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                </SortableSongItem>
              );
            })}
          </ol>
        </SortableContext>
      )}

      {showPicker ? (
        <SongPicker excludeIds={set.songIds} onPick={addSong} />
      ) : (
        <button type="button" onClick={() => setShowPicker(true)} className="link-accent text-sm">
          {t("setlist.addSong")}
        </button>
      )}
    </div>
  );
}
