import type { SetlistSet, Song } from "@db";
import { useDb } from "@db/provider";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ACTIVE_STATUS_FILTER,
  matchesStatusFilter,
  SET_PICKER_STATUS_FILTER_LIST,
  songStatusLabelKey,
} from "@domain/song-status";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Choice } from "../../design-system/components/card";
import { buildCatalogDragId } from "../hooks/use-setlist-dnd";
import { SongRowContent } from "./song-row-content";

type StatusFilter = (typeof SET_PICKER_STATUS_FILTER_LIST)[number];

interface SongCatalogPanelProps {
  sets: readonly Pick<SetlistSet, "name" | "songIds">[];
}

export function SongCatalogPanel({ sets }: SongCatalogPanelProps) {
  const { t } = useTranslation();
  const db = useDb();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ACTIVE_STATUS_FILTER);
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);

  // First set each song is in, by name
  const setOf = useMemo(() => {
    const names = new Map<string, string>();
    sets.forEach((set, i) => {
      for (const id of set.songIds) {
        if (!names.has(id)) names.set(id, set.name || `${t("setlist.set")} ${i + 1}`);
      }
    });
    return names;
  }, [sets, t]);

  // Songs still to place first, then the placed ones, each alphabetical
  const shown = useMemo(() => {
    if (!songs) return [];
    const q = search.toLowerCase();
    return songs
      .filter(
        (s) =>
          matchesStatusFilter(s.status, statusFilter) &&
          (!q || s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          Number(setOf.has(a.id)) - Number(setOf.has(b.id)) || a.title.localeCompare(b.title),
      );
  }, [songs, search, statusFilter, setOf]);

  const { setNodeRef, isOver } = useDroppable({ id: "catalog" });

  return (
    <div ref={setNodeRef} className="hidden lg:block lg:w-2/5 lg:shrink-0">
      <div
        className={`sticky top-4 rounded-lg border bg-bg-surface transition-colors ${isOver ? "border-accent" : "border-border"}`}
      >
        <div className="border-b border-border p-3">
          <h3 className="mb-2 text-sm font-semibold">{t("setlist.songCatalog")}</h3>
          <input
            type="search"
            placeholder={t("setlist.searchSongs")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SET_PICKER_STATUS_FILTER_LIST.map((status) => (
              <Choice
                key={status || "all"}
                selected={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status === ACTIVE_STATUS_FILTER
                  ? t("songStatus.filterActive")
                  : status
                    ? t(songStatusLabelKey(status))
                    : t("common.all")}
              </Choice>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-3 text-center text-sm text-text-faint">
            {songs && songs.length === 0
              ? t("setlist.noCatalogSongsShort")
              : t("setlist.noAvailableSongs")}
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col overflow-y-auto p-1">
            {shown.map((song) => {
              const setName = setOf.get(song.id);
              return setName ? (
                <CatalogUsedItem key={song.id} song={song} setName={setName} />
              ) : (
                <CatalogDraggableItem key={song.id} song={song} />
              );
            })}
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
      className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-hover"
      style={{ opacity: isDragging ? 0.4 : undefined }}
      {...attributes}
      {...listeners}
    >
      <span className="cursor-grab text-text-faint active:cursor-grabbing">⠿</span>
      <SongRowContent song={song} statusIndicator="dot" />
    </li>
  );
}

/** Already in the setlist: shown dimmed with its set, not draggable again. */
function CatalogUsedItem({ song, setName }: { song: Song; setName: string }) {
  const { t } = useTranslation();

  return (
    <li className="flex items-center gap-2 px-2 py-1.5">
      <span aria-hidden="true" className="invisible">
        ⠿
      </span>
      <div className="flex min-w-0 flex-1 opacity-50">
        <SongRowContent song={song} statusIndicator="dot" />
      </div>
      <span className="shrink-0">
        <Badge tone="muted">{t("setlist.inSet", { name: setName })}</Badge>
      </span>
    </li>
  );
}
