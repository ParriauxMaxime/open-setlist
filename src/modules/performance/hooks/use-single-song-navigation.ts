import { useDb } from "@db/provider";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import type { FlatEntry } from "./use-setlist-navigation";

export function useSingleSongNavigation(songId: string) {
  const db = useDb();
  const song = useLiveQuery(() => db.songs.get(songId), [songId, db]);
  const [currentIndex] = useState(0);

  const current: FlatEntry = {
    songId,
    setName: "Quick play",
    setIndex: 0,
    indexInSet: 0,
    setSize: 1,
  };

  return {
    setlist: undefined,
    flatSongs: [current],
    currentIndex,
    setCurrentIndex: () => {},
    current,
    currentSong: song,
    prevSong: undefined,
    nextSong: undefined,
    isFirst: true,
    isLast: true,
    loaded: song !== undefined,
  };
}
