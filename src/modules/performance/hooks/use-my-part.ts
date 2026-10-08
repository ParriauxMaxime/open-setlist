import { useDb } from "@db/provider";
import { parse } from "@domain/chordpro/parser";
import { type PartView, songParts } from "@domain/chordpro/visibility";
import { ALL_PARTS, normalizePart, sortParts } from "@domain/parts";
import { loadPreferences, resolvePartView, savePartView } from "@domain/preferences";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import type { FlatEntry } from "./use-setlist-navigation";

export interface MyPart {
  view: PartView;
  /** Parts to pick from (besides "all"): `for=` values of the songs + favourite instrument. */
  choices: string[];
  update: (patch: Partial<PartView>) => void;
}

export function useMyPart(flatSongs: FlatEntry[]): MyPart {
  const db = useDb();
  const [prefs] = useState(loadPreferences);
  const favorite = normalizePart(prefs.favoriteInstrument);
  const [view, setView] = useState(() => resolvePartView(prefs));
  // Latest view, so quick successive changes build on each other
  const viewRef = useRef(view);

  const songIds = useMemo(() => flatSongs.map((e) => e.songId), [flatSongs]);
  const found = useLiveQuery(async () => {
    const songs = await db.songs.bulkGet(songIds);
    return songs.flatMap((s) => (s?.content.includes("for=") ? songParts(parse(s.content)) : []));
  }, [songIds, db]);

  const choices = useMemo(
    () => sortParts([...(found ?? []), favorite, view.instrument].filter((p) => p !== ALL_PARTS)),
    [found, favorite, view.instrument],
  );

  const update = useCallback((patch: Partial<PartView>) => {
    const next = { ...viewRef.current, ...patch };
    viewRef.current = next;
    setView(next);
    savePartView(next);
  }, []);

  return useMemo(() => ({ view, choices, update }), [view, choices, update]);
}
