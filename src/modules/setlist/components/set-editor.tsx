import type { SetlistSet } from "@db";
import { useDb } from "@db/provider";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../design-system/components/empty-state";
import { Textarea } from "../../design-system/components/form";
import { buildSetDragId } from "../hooks/use-setlist-dnd";
import { SongPicker } from "./song-picker";
import { SongRowContent } from "./song-row-content";
import type { SetDragHandleProps } from "./sortable-set";
import { SortableSongItem } from "./sortable-song-item";

interface SetEditorProps {
  set: SetlistSet;
  setIndex: number;
  /** Every set of the setlist, to show where a song already is. */
  allSets: readonly SetlistSet[];
  songDragIds: string[];
  onUpdate: (set: SetlistSet) => void;
  onRemove: () => void;
  canRemove: boolean;
  dragHandle?: SetDragHandleProps;
  /** Last song removed from this set, while it can still be put back. */
  removed?: RemovedSong;
  onSongRemoved: (removed: RemovedSong) => void;
  onUndoRemove: () => void;
  /** The setlist's tech notes, in place of the songs' own. */
  techNotes: Record<string, string> | undefined;
  onTechNote: (songId: string, text: string) => void;
}

export interface RemovedSong {
  songId: string;
  index: number;
  title: string;
}

const ROW_BUTTON_SHAPE =
  "flex size-10 items-center justify-center rounded-md hover:bg-bg-hover hover:text-text disabled:opacity-30";
const ROW_BUTTON = `${ROW_BUTTON_SHAPE} text-text-faint`;

export function SetEditor({
  set,
  setIndex,
  allSets,
  songDragIds,
  onUpdate,
  onRemove,
  canRemove,
  dragHandle,
  removed,
  onSongRemoved,
  onUndoRemove,
  techNotes,
  onTechNote,
}: SetEditorProps) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const [openTechNotes, setOpenTechNotes] = useState<ReadonlySet<string>>(() => new Set());
  const toggleTechNote = (songId: string) =>
    setOpenTechNotes((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });

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

  const addSongs = (songIds: string[]) => {
    const fresh = songIds.filter((id) => !set.songIds.includes(id));
    onUpdate({ ...set, songIds: [...set.songIds, ...fresh] });
    setShowPicker(false);
  };
  const closePicker = useCallback(() => setShowPicker(false), []);

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
        <EmptyState
          className="px-4 py-3"
          message={
            <>
              <span className="lg:hidden">{t("setlist.noSongsInSet")}</span>
              <span className="hidden lg:inline">{t("setlist.noSongsInSetDrag")}</span>
            </>
          }
        />
      ) : (
        <SortableContext items={songDragIds} strategy={verticalListSortingStrategy}>
          <ol className="divide-y divide-border">
            {set.songIds.map((songId, i) => {
              const song = songs?.find((s) => s?.id === songId);
              const dragId = songDragIds[i];
              const override = techNotes?.[songId];
              const techOpen = openTechNotes.has(songId);
              return (
                <SortableSongItem
                  key={dragId}
                  id={dragId}
                  songTitle={song?.title}
                  below={
                    techOpen && (
                      <div className="pt-1 pr-2 pb-2 pl-11">
                        <Textarea
                          rows={2}
                          value={override ?? ""}
                          onChange={(e) => onTechNote(songId, e.target.value)}
                          placeholder={song?.techNotes?.trim() || t("setlist.techNotePlaceholder")}
                          aria-label={t("setlist.techNoteFor", {
                            title: song?.title ?? t("common.unknown"),
                          })}
                        />
                      </div>
                    )
                  }
                >
                  <span className="w-5 text-center text-xs tabular-nums text-text-faint">
                    {i + 1}
                  </span>
                  <SongRowContent song={song} statusIndicator="warning" markMissingLength />
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleTechNote(songId)}
                      aria-label={t("setlist.techNote")}
                      aria-expanded={techOpen}
                      title={override ? override : t("setlist.techNote")}
                      className={`${ROW_BUTTON_SHAPE} ${override ? "bg-accent-muted text-accent" : "text-text-faint"}`}
                    >
                      🔧
                    </button>
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
        <button type="button" onClick={() => setShowPicker(true)} className="link-accent text-sm">
          {t("setlist.addSong")}
        </button>
      </div>
      {showPicker && (
        <SongPicker
          setName={set.name || `${t("setlist.set")} ${setIndex + 1}`}
          sets={allSets}
          contextSongs={songs}
          onAdd={addSongs}
          onClose={closePicker}
        />
      )}
    </div>
  );
}
