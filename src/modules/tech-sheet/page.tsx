import type { Song } from "@db";
import { useDb } from "@db/provider";
import { formatDuration } from "@domain/format";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { EditorHeader } from "../design-system/components/editor-header";

interface TechSheetPageProps {
  setlistId: string;
}

export function TechSheetPage({ setlistId }: TechSheetPageProps) {
  const { t } = useTranslation();
  const db = useDb();

  const setlist = useLiveQuery(() => db.setlists.get(setlistId), [setlistId, db]);

  const allSongIds = useMemo(
    () => (setlist ? [...new Set(setlist.sets.flatMap((s) => s.songIds))] : []),
    [setlist],
  );

  const songs = useLiveQuery(
    () => (allSongIds.length > 0 ? db.songs.bulkGet(allSongIds) : []),
    [allSongIds, db],
  );

  const songMap = useMemo(() => {
    const map = new Map<string, Song>();
    if (songs) {
      for (const s of songs) {
        if (s) map.set(s.id, s);
      }
    }
    return map;
  }, [songs]);

  if (!setlist) {
    return (
      <div className="p-page">
        <p className="text-text-muted">{t("common.loading")}</p>
      </div>
    );
  }

  const totalSongs = setlist.sets.reduce((n, s) => n + s.songIds.length, 0);

  return (
    <div className="p-page">
      <EditorHeader
        breadcrumbs={[{ label: t("nav.setlists"), to: Router.Setlists() }, { label: setlist.name }]}
        actions={null}
      />

      {totalSongs === 0 ? (
        <p className="text-text-muted">{t("techSheet.noSongs")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {setlist.sets.map((set, setIdx) => {
            if (set.songIds.length === 0) return null;
            let songNumber = 0;
            for (let i = 0; i < setIdx; i++) {
              songNumber += setlist.sets[i].songIds.length;
            }

            return (
              <div key={set.name}>
                {setlist.sets.length > 1 && (
                  <h2 className="mb-3 text-lg font-semibold text-text">{set.name}</h2>
                )}
                <div className="flex flex-col gap-2">
                  {set.songIds.map((songId) => {
                    const song = songMap.get(songId);
                    if (!song) return null;
                    songNumber++;

                    const flatIndex = songNumber - 1;

                    return (
                      <Link
                        key={songId}
                        to={`${Router.Perform({ setlistId })}?start=${flatIndex}`}
                        className="block rounded-md border border-border bg-bg-surface px-4 py-3 hover:bg-bg-hover transition-colors"
                      >
                        <div className="font-semibold text-text">
                          {songNumber}. {song.title}
                          {song.artist && (
                            <span className="font-normal text-text-muted">
                              {" "}
                              &mdash; {song.artist}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm text-text-muted">
                          {song.key && <span>Key: {song.key}</span>}
                          {song.bpm && <span>BPM: {song.bpm}</span>}
                          {song.duration && <span>{formatDuration(song.duration)}</span>}
                        </div>
                        {song.notes && (
                          <div className="mt-2 text-sm text-text-muted">
                            <span className="mr-1">&#127925;</span>
                            {song.notes}
                          </div>
                        )}
                        {song.techNotes && (
                          <div className="mt-2 text-sm text-accent">
                            <span className="mr-1">&#128295;</span>
                            {song.techNotes}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
