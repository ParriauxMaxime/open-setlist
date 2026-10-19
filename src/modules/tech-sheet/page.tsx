import type { Song } from "@db";
import { useDb } from "@db/provider";
import { formatKey } from "@domain/chords/notation";
import { formatDuration } from "@domain/format";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { Card } from "../design-system/components/card";
import { EditorHeader } from "../design-system/components/editor-header";
import { useNotation } from "../shared/hooks/use-notation";

interface TechSheetPageProps {
  setlistId: string;
}

export function TechSheetPage({ setlistId }: TechSheetPageProps) {
  const { t } = useTranslation();
  const db = useDb();
  const notation = useNotation();

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
    <div className="max-w-3xl p-page">
      <EditorHeader
        breadcrumbs={[{ label: t("nav.setlists"), to: Router.Setlists() }, { label: setlist.name }]}
        actions={
          totalSongs > 0 ? (
            <Link to={Router.Print({ setlistId })} className="btn btn-outline btn-responsive">
              {t("print.print")}
            </Link>
          ) : null
        }
      />

      {totalSongs === 0 ? (
        <p className="text-text-muted">{t("techSheet.noSongs")}</p>
      ) : (
        <div>
          {setlist.sets.map((set, setIdx) => {
            if (set.songIds.length === 0) return null;
            let songNumber = 0;
            for (let i = 0; i < setIdx; i++) {
              songNumber += setlist.sets[i].songIds.length;
            }

            return (
              <Card key={set.name} title={setlist.sets.length > 1 ? set.name : undefined}>
                {set.songIds.map((songId) => {
                  const song = songMap.get(songId);
                  if (!song) return null;
                  songNumber++;

                  const flatIndex = songNumber - 1;

                  return (
                    <Link
                      key={songId}
                      to={`${Router.Perform({ setlistId })}?start=${flatIndex}`}
                      className="flex gap-3 px-4 py-3 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-bg-hover"
                    >
                      <span className="w-6 shrink-0 pt-0.5 text-right text-sm tabular-nums text-text-faint">
                        {songNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-text">
                          {song.title}
                          {song.artist && (
                            <span className="font-normal text-text-muted"> · {song.artist}</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-text-muted">
                          {song.key && (
                            <span className="text-chord">
                              {t("print.key", { key: formatKey(song.key, notation) })}
                            </span>
                          )}
                          {song.bpm && <span>{t("print.bpm", { bpm: song.bpm })}</span>}
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
                      </div>
                    </Link>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
