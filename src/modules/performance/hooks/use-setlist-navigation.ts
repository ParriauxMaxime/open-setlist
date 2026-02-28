import type { Song } from "@db";
import { useDb } from "@db/provider";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

export interface FlatEntry {
  songId: string;
  setName: string;
  setIndex: number;
  indexInSet: number;
  setSize: number;
}

export function useSetlistNavigation(setlistId: string) {
  const db = useDb();
  const setlist = useLiveQuery(() => db.setlists.get(setlistId), [setlistId, db]);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const start = Number.parseInt(params.get("start") ?? "", 10);
    return Number.isNaN(start) || start < 0 ? 0 : start;
  });

  const flatSongs = useMemo<FlatEntry[]>(() => {
    if (!setlist) return [];
    const result: FlatEntry[] = [];
    for (let si = 0; si < setlist.sets.length; si++) {
      const set = setlist.sets[si];
      for (let i = 0; i < set.songIds.length; i++) {
        result.push({
          songId: set.songIds[i],
          setName: set.name,
          setIndex: si,
          indexInSet: i,
          setSize: set.songIds.length,
        });
      }
    }
    return result;
  }, [setlist]);

  // Clamp index if it's out of bounds (e.g. stale bookmark after songs removed)
  useEffect(() => {
    if (flatSongs.length > 0 && currentIndex >= flatSongs.length) {
      setCurrentIndex(flatSongs.length - 1);
    }
  }, [flatSongs.length, currentIndex]);

  const allSongIds = useMemo(() => flatSongs.map((s) => s.songId), [flatSongs]);
  const songs = useLiveQuery(async () => {
    if (allSongIds.length === 0) return new Map<string, Song>();
    const results = await db.songs.bulkGet(allSongIds);
    const map = new Map<string, Song>();
    for (const s of results) {
      if (s) map.set(s.id, s);
    }
    return map;
  }, [allSongIds, db]);

  const current = flatSongs[currentIndex];
  const currentSong = current && songs ? songs.get(current.songId) : undefined;
  const prevEntry = flatSongs[currentIndex - 1];
  const nextEntry = flatSongs[currentIndex + 1];
  const prevSong = prevEntry && songs ? songs.get(prevEntry.songId) : undefined;
  const nextSong = nextEntry && songs ? songs.get(nextEntry.songId) : undefined;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === flatSongs.length - 1;

  return {
    setlist,
    flatSongs,
    currentIndex,
    setCurrentIndex,
    current,
    currentSong,
    prevSong,
    nextSong,
    isFirst,
    isLast,
  };
}
