import type { Song } from "@db";
import { useDb } from "@db/provider";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildCatalogDragId } from "../hooks/use-setlist-dnd";
import { SongRowContent } from "./song-row-content";

interface SongCatalogPanelProps {
  /** All song IDs currently in any set */
  usedSongIds: string[];
}

export function SongCatalogPanel({ usedSongIds }: SongCatalogPanelProps) {
  const { t } = useTranslation();
  const db = useDb();
  const [search, setSearch] = useState("");
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);

  const available = useMemo(() => {
    if (!songs) return [];
    const usedSet = new Set(usedSongIds);
    let result = songs.filter((s) => !usedSet.has(s.id));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [songs, usedSongIds, search]);

  const { setNodeRef, isOver } = useDroppable({ id: "catalog" });

  return (
    <div ref={setNodeRef} className="hidden lg:block lg:w-1/2 lg:shrink-0">
      <div
        className={`sticky top-4 rounded-md border bg-bg-surface p-3 transition-colors ${isOver ? "border-accent" : "border-border"}`}
      >
        <h3 className="mb-2 text-sm font-semibold">{t("setlist.songCatalog")}</h3>
        <input
          type="search"
          placeholder={t("setlist.searchSongs")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field mb-2 w-full"
        />
        {available.length === 0 ? (
          <p className="py-2 text-center text-sm text-text-faint">
            {songs && songs.length === 0
              ? t("setlist.noCatalogSongsShort")
              : t("setlist.noAvailableSongs")}
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {available.map((song) => (
              <CatalogDraggableItem key={song.id} song={song} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CatalogDraggableItem({ song }: { song: Song }) {
  const dragId = buildCatalogDragId(song.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { songTitle: song.title },
  });

  return (
    <li
      ref={setNodeRef}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-bg-hover"
      style={{ opacity: isDragging ? 0.4 : undefined }}
      {...attributes}
      {...listeners}
    >
      <span className="cursor-grab text-text-faint active:cursor-grabbing">⠿</span>
      <SongRowContent song={song} />
    </li>
  );
}
