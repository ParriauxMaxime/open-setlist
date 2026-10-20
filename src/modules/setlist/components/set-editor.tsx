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
  /** Last song removed from this set, while it can still be put back. */
  removed?: RemovedSong;
  onSongRemoved: (removed: RemovedSong) => void;
  onUndoRemove: () => void;
}

export interface RemovedSong {
  songId: string;
  index: number;
  title: string;
}

const ROW_BUTTON =
  "flex size-10 items-center justify-center rounded-md text-text-faint hover:bg-bg-hover hover:text-text disabled:opacity-30";

export function SetEditor({
  set,
  setIndex,
  songDragIds,
  onUpdate,
  onRemove,
  canRemove,
  dragHandle,
  removed,
  onSongRemoved,
  onUndoRemove,
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
    const songId = set.songIds[index];
    const title = songs?.find((s) => s?.id === songId)?.title ?? t("common.unknown");
    const next = [...set.songIds];
    next.splice(index, 1);
    onUpdate({ ...set, songIds: next });
    onSongRemoved({ songId, index, title });
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= set.songIds.length) return;
    const next = [...set.songIds];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdate({ ...set, songIds: next });
  };

  return (
    <div
      ref={setDroppableRef}
      className="divide-y divide-border rounded-lg border border-border bg-bg-surface"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle && (
            <button
              type="button"
              aria-label={t("a11y.dragToReorder")}
              className="-ml-2 flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-lg text-text-faint hover:bg-bg-hover hover:text-text active:cursor-grabbing"
              {...dragHandle.dragAttributes}
              {...dragHandle.dragListeners}
            >
              ⠿
            </button>
          )}
          <div className="w-48 min-w-0">
            <input
              type="text"
              value={set.name}
              aria-label={t("setlist.set")}
              onChange={(e) => onUpdate({ ...set, name: e.target.value })}
              className="field-sm font-medium"
            />
          </div>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="btn btn-danger btn-sm">
            {t("setlist.removeSet")}
          </button>
        )}
      </div>

      {set.songIds.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-faint">{t("setlist.noSongsInSet")}</p>
      ) : (
        <SortableContext items={songDragIds} strategy={verticalListSortingStrategy}>
          <ol className="divide-y divide-border">
            {set.songIds.map((songId, i) => {
              const song = songs?.find((s) => s?.id === songId);
              const dragId = songDragIds[i];
              return (
                <SortableSongItem key={dragId} id={dragId} songTitle={song?.title}>
                  <span className="w-5 text-center text-xs tabular-nums text-text-faint">
                    {i + 1}
                  </span>
                  <SongRowContent song={song} statusIndicator="warning" />
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSong(i, -1)}
                      disabled={i === 0}
                      aria-label={t("a11y.moveUp")}
                      className={ROW_BUTTON}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSong(i, 1)}
                      disabled={i === set.songIds.length - 1}
                      aria-label={t("a11y.moveDown")}
                      className={ROW_BUTTON}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSong(i)}
                      aria-label={t("a11y.remove")}
                      className={`${ROW_BUTTON} hover:text-danger`}
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

      {removed && (
        <output className="flex items-center gap-3 px-4 py-1 text-sm text-text-muted">
          <span className="min-w-0 truncate">
            {t("setlist.removedSong", { title: removed.title })}
          </span>
          <button
            type="button"
            onClick={onUndoRemove}
            className="link-accent flex min-h-10 shrink-0 items-center px-2"
          >
            {t("setlist.undo")}
          </button>
        </output>
      )}

      <div className="px-4 py-2">
        {showPicker ? (
          <SongPicker excludeIds={set.songIds} onPick={addSong} contextSongs={songs} />
        ) : (
          <button type="button" onClick={() => setShowPicker(true)} className="link-accent text-sm">
            {t("setlist.addSong")}
          </button>
        )}
      </div>
    </div>
  );
}
