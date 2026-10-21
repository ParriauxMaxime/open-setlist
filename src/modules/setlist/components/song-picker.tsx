import type { SetlistSet, Song } from "@db";
import { useDb } from "@db/provider";
import { formatKey } from "@domain/chords/notation";
import { relativeKey, sameKeyEnharmonic } from "@domain/music";
import { ACTIVE_STATUS_FILTER, matchesStatusFilter } from "@domain/song-status";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../shared/hooks/use-focus-trap";
import { useNotation } from "../../shared/hooks/use-notation";
import { useSongSetNames } from "../hooks/use-song-set-names";
import { SongRowContent } from "./song-row-content";
import { type SetPickerStatusFilter, StatusFilterChips } from "./status-filter-chips";
import { UsedSongContent } from "./used-song-content";

interface SongPickerProps {
  setName: string;
  /** Every set of the setlist: a song already in one is shown with it, not offered again. */
  sets: readonly Pick<SetlistSet, "name" | "songIds">[];
  /** Songs of the set being filled, for the key and tag suggestions. */
  contextSongs?: (Song | undefined)[];
  /** Songs to append to the set, in the order they were picked. */
  onAdd: (songIds: string[]) => void;
  onClose: () => void;
}

interface ScoredSong {
  song: Song;
  score: number;
  keyBadge?: string; // key name to show in badge (same or relative key)
  tagBadges: string[]; // matching tags
}

function scoreSong(song: Song, lastKey: string | undefined, setTags: Set<string>): ScoredSong {
  let score = 0;
  let keyBadge: string | undefined;
  const tagBadges: string[] = [];

  if (lastKey && song.key) {
    if (sameKeyEnharmonic(song.key, lastKey)) {
      score += 3;
      keyBadge = song.key;
    } else {
      const rel = relativeKey(lastKey);
      if (rel && sameKeyEnharmonic(song.key, rel)) {
        score += 2;
        keyBadge = song.key;
      }
    }
  }

  let tagScore = 0;
  for (const tag of song.tags) {
    if (setTags.has(tag) && tagScore < 2) {
      tagScore++;
      tagBadges.push(tag);
    }
  }
  score += tagScore;

  return { song, score, keyBadge, tagBadges };
}

const byScoreThenTitle = (a: ScoredSong, b: ScoredSong) =>
  b.score - a.score || a.song.title.localeCompare(b.song.title);
const byTitle = (a: ScoredSong, b: ScoredSong) => a.song.title.localeCompare(b.song.title);

/**
 * Full screen on phones, a dialog on wider screens. A tap adds a song and closes; ticking
 * songs first adds them all at once, in the order they were ticked.
 */
export function SongPicker({ setName, sets, contextSongs, onAdd, onClose }: SongPickerProps) {
  const { t } = useTranslation();
  const db = useDb();
  const titleId = useId();
  const trapRef = useFocusTrap(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SetPickerStatusFilter>(ACTIVE_STATUS_FILTER);
  const [checked, setChecked] = useState<string[]>([]);
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);
  const setOf = useSongSetNames(sets);

  useEffect(() => searchRef.current?.focus(), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Derive context from set songs
  const { lastKey, setTags } = useMemo(() => {
    if (!contextSongs) return { lastKey: undefined, setTags: new Set<string>() };
    const defined = contextSongs.filter((s): s is Song => s !== undefined);
    const last = defined.length > 0 ? defined[defined.length - 1] : undefined;
    const tags = new Set<string>();
    for (const s of defined) {
      for (const tag of s.tags) tags.add(tag);
    }
    return { lastKey: last?.key, setTags: tags };
  }, [contextSongs]);

  const { suggested, rest, used } = useMemo(() => {
    const q = search.toLowerCase();
    const scored = (songs ?? [])
      .filter(
        (s) =>
          matchesStatusFilter(s.status, statusFilter) &&
          (!q || s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)),
      )
      .map((s) => scoreSong(s, lastKey, setTags));
    const available = scored.filter((item) => !setOf.has(item.song.id));
    const inSetlist = scored.filter((item) => setOf.has(item.song.id)).sort(byTitle);
    // A search lists every match by relevance; otherwise suggestions come first
    if (q) return { suggested: [], rest: available.sort(byScoreThenTitle), used: inSetlist };
    return {
      suggested: available.filter((item) => item.score > 0).sort(byScoreThenTitle),
      rest: available.filter((item) => item.score === 0).sort(byTitle),
      used: inSetlist,
    };
  }, [songs, search, statusFilter, lastKey, setTags, setOf]);

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const tap = (id: string) => (checked.length === 0 ? onAdd([id]) : toggle(id));

  const renderRow = (item: ScoredSong) => (
    <PickerRow
      key={item.song.id}
      item={item}
      checked={checked.includes(item.song.id)}
      onToggle={toggle}
      onTap={tap}
    />
  );
  const isEmpty = suggested.length + rest.length + used.length === 0;

  // Out of the set's sortable box, whose drag transform would move a fixed overlay with it
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 md:items-center md:p-4">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full flex-col bg-bg md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-xl md:shadow-xl"
      >
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <h2 id={titleId} className="min-w-0 flex-1 truncate text-lg font-bold">
              {t("setlist.picker.title", { set: setName })}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-text-faint hover:bg-bg-hover hover:text-text"
            >
              ✕
            </button>
          </div>
          <input
            ref={searchRef}
            type="search"
            placeholder={t("setlist.searchSongsToAdd")}
            aria-label={t("setlist.searchSongsToAdd")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field"
          />
          <StatusFilterChips value={statusFilter} onChange={setStatusFilter} />
        </div>

        {isEmpty ? (
          <p className="flex-1 px-4 py-6 text-center text-sm text-text-faint">
            {songs && songs.length === 0
              ? t("setlist.noCatalogSongs")
              : t("setlist.noMatchingSongs")}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto p-1">
            {suggested.length > 0 && (
              <>
                <li className="px-3 pt-2 text-xs font-medium text-text-faint">
                  {t("setlist.suggested")}
                </li>
                {suggested.map(renderRow)}
                {rest.length > 0 && (
                  <li className="px-3 pt-3 text-xs font-medium text-text-faint">
                    {t("setlist.allSongs")}
                  </li>
                )}
              </>
            )}
            {rest.map(renderRow)}
            {used.map(({ song }) => (
              <li key={song.id} className="flex items-center gap-2 py-2 pr-3 pl-14">
                <UsedSongContent song={song} setName={setOf.get(song.id) ?? ""} />
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {checked.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => onAdd(checked)}
                className="btn btn-primary flex-1"
              >
                {t("setlist.picker.addChecked", { count: checked.length })}
              </button>
              <button type="button" onClick={() => setChecked([])} className="btn btn-ghost">
                {t("setlist.picker.clearChecked")}
              </button>
            </>
          ) : (
            <p className="text-xs text-text-faint">{t("setlist.picker.hint")}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PickerRow({
  item,
  checked,
  onToggle,
  onTap,
}: {
  item: ScoredSong;
  checked: boolean;
  onToggle: (id: string) => void;
  onTap: (id: string) => void;
}) {
  const { t } = useTranslation();
  const notation = useNotation();
  const { song, keyBadge, tagBadges } = item;
  return (
    <li className={`flex items-center rounded-md ${checked ? "bg-accent-muted" : ""}`}>
      <label className="flex size-12 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(song.id)}
          aria-label={t("setlist.picker.select", { title: song.title })}
          className="h-4 w-4 rounded accent-[var(--color-accent)]"
        />
      </label>
      <button
        type="button"
        onClick={() => onTap(song.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pr-3 text-left hover:bg-bg-hover"
      >
        <SongRowContent song={song} statusIndicator="dot" />
        {keyBadge && (
          <span className="shrink-0 rounded-sm bg-chord/15 px-1 text-xs text-chord">
            {formatKey(keyBadge, notation)}
          </span>
        )}
        {tagBadges.map((tag) => (
          <span key={tag} className="shrink-0 rounded-sm bg-accent/15 px-1 text-xs text-accent">
            {tag}
          </span>
        ))}
      </button>
    </li>
  );
}
