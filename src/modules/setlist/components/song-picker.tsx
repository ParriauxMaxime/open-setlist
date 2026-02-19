import { db } from "@db";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface SongPickerProps {
  excludeIds: string[];
  onPick: (songId: string) => void;
}

export function SongPicker({ excludeIds, onPick }: SongPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray());

  const filtered = useMemo(() => {
    if (!songs) return [];
    const excludeSet = new Set(excludeIds);
    let result = songs.filter((s) => !excludeSet.has(s.id));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [songs, excludeIds, search]);

  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <input
        type="search"
        placeholder={t("setlist.searchSongsToAdd")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="field mb-2"
      />
      {filtered.length === 0 ? (
        <p className="py-2 text-center text-sm text-text-faint">
          {songs && songs.length === 0 ? t("setlist.noCatalogSongs") : t("setlist.noMatchingSongs")}
        </p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {filtered.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => onPick(song.id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover"
              >
                <span className="flex-1 truncate">{song.title}</span>
                {song.artist && <span className="shrink-0 text-text-faint">{song.artist}</span>}
                {song.key && <span className="shrink-0 text-chord text-xs">({song.key})</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
