import type { Song } from "@db";
import { useDb } from "@db/provider";
import { relativeKey, sameKeyEnharmonic } from "@domain/music";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface SongPickerProps {
  excludeIds: string[];
  onPick: (songId: string) => void;
  contextSongs?: (Song | undefined)[];
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

export function SongPicker({ excludeIds, onPick, contextSongs }: SongPickerProps) {
  const { t } = useTranslation();
  const db = useDb();
  const [search, setSearch] = useState("");
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);

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

  const { suggested, rest, filtered } = useMemo(() => {
    if (!songs) return { suggested: [], rest: [], filtered: [] };
    const excludeSet = new Set(excludeIds);
    let candidates = songs.filter((s) => !excludeSet.has(s.id));

    if (search) {
      const q = search.toLowerCase();
      candidates = candidates.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q),
      );
      // When searching, return all results sorted by score desc then alphabetically
      const scored = candidates.map((s) => scoreSong(s, lastKey, setTags));
      scored.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
      return { suggested: [], rest: [], filtered: scored };
    }

    // No search: split into suggested (score > 0) and rest
    const scored = candidates.map((s) => scoreSong(s, lastKey, setTags));
    const sugg: ScoredSong[] = [];
    const other: ScoredSong[] = [];
    for (const item of scored) {
      if (item.score > 0) sugg.push(item);
      else other.push(item);
    }
    sugg.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
    other.sort((a, b) => a.song.title.localeCompare(b.song.title));
    return { suggested: sugg, rest: other, filtered: [] };
  }, [songs, excludeIds, search, lastKey, setTags]);

  const isEmpty = search ? filtered.length === 0 : suggested.length + rest.length === 0;

  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <input
        type="search"
        placeholder={t("setlist.searchSongsToAdd")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="field mb-2"
      />
      {isEmpty ? (
        <p className="py-2 text-center text-sm text-text-faint">
          {songs && songs.length === 0 ? t("setlist.noCatalogSongs") : t("setlist.noMatchingSongs")}
        </p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {search ? (
            filtered.map((item) => <SongRow key={item.song.id} item={item} onPick={onPick} />)
          ) : (
            <>
              {suggested.length > 0 && (
                <>
                  <li className="px-2 pt-1 text-xs font-medium text-text-faint">
                    {t("setlist.suggested")}
                  </li>
                  {suggested.map((item) => (
                    <SongRow key={item.song.id} item={item} onPick={onPick} />
                  ))}
                </>
              )}
              {suggested.length > 0 && rest.length > 0 && (
                <li className="px-2 pt-2 text-xs font-medium text-text-faint">
                  {t("setlist.allSongs")}
                </li>
              )}
              {rest.map((item) => (
                <SongRow key={item.song.id} item={item} onPick={onPick} />
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function SongRow({ item, onPick }: { item: ScoredSong; onPick: (id: string) => void }) {
  const { song, keyBadge, tagBadges } = item;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(song.id)}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover"
      >
        <span className="flex-1 truncate">{song.title}</span>
        {song.artist && <span className="shrink-0 text-text-faint">{song.artist}</span>}
        {song.key && <span className="shrink-0 text-chord text-xs">({song.key})</span>}
        {keyBadge && (
          <span className="shrink-0 rounded-sm bg-chord/15 px-1 text-xs text-chord">
            {keyBadge}
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
