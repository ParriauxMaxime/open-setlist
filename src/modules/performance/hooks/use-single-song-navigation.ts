import { useDb } from "@db/provider";
import { useLiveQuery } from "dexie-react-hooks";
import { type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Router } from "../../../router";
import type { FlatEntry } from "./use-setlist-navigation";

export function useSingleSongNavigation(songId: string) {
  const db = useDb();
  const allSongs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);

  const [activeSongId, setActiveSongId] = useState(songId);

  // Sync if the URL param changes externally (e.g. deep link)
  useEffect(() => {
    setActiveSongId(songId);
  }, [songId]);

  const currentIndex = useMemo(() => {
    if (!allSongs) return 0;
    const idx = allSongs.findIndex((s) => s.id === activeSongId);
    return idx === -1 ? 0 : idx;
  }, [allSongs, activeSongId]);

  // Refs so the callback identity stays stable (like useState's setter)
  // — useSwipeStrip's touch handlers capture it once and never re-attach.
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const allSongsRef = useRef(allSongs);
  allSongsRef.current = allSongs;

  const setCurrentIndex = useCallback((action: SetStateAction<number>) => {
    const songs = allSongsRef.current;
    if (!songs) return;
    const next = typeof action === "function" ? action(currentIndexRef.current) : action;
    const song = songs[next];
    if (song) setActiveSongId(song.id);
  }, []);

  // Keep URL in sync when swiping
  useEffect(() => {
    if (activeSongId !== songId) {
      Router.replace("PerformSong", { songId: activeSongId });
    }
  }, [activeSongId, songId]);

  const flatSongs = useMemo<FlatEntry[]>(() => {
    if (!allSongs) return [];
    return allSongs.map((s, i) => ({
      songId: s.id,
      setName: "All songs",
      setIndex: 0,
      indexInSet: i,
      setSize: allSongs.length,
    }));
  }, [allSongs]);

  const currentSong = allSongs?.[currentIndex];
  const prevSong = allSongs?.[currentIndex - 1];
  const nextSong = allSongs?.[currentIndex + 1];

  const isFirst = currentIndex === 0;
  const isLast = !allSongs || currentIndex === allSongs.length - 1;

  return {
    setlist: undefined,
    flatSongs,
    currentIndex,
    setCurrentIndex,
    current: flatSongs[currentIndex],
    currentSong,
    prevSong,
    nextSong,
    isFirst,
    isLast,
    loaded: allSongs !== undefined,
  };
}
