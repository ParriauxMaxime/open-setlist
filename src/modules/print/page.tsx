import type { Song } from "@db";
import { useDb } from "@db/provider";
import { formatKey } from "@domain/chords/notation";
import { buildPrintSetlist, PrintMode } from "@domain/print";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { type ReactNode, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { useNotation } from "../shared/hooks/use-notation";
import { ChartBooklet } from "./components/chart-booklet";
import { PrintToolbar } from "./components/print-toolbar";
import { StageSheet } from "./components/stage-sheet";

interface PrintPageProps {
  setlistId: string;
  mode?: PrintMode;
}

export function PrintPage({ setlistId, mode = PrintMode.Sheet }: PrintPageProps) {
  const { t } = useTranslation();
  const db = useDb();
  // null = not found, undefined = still loading
  const setlist = useLiveQuery(
    async () => (await db.setlists.get(setlistId)) ?? null,
    [setlistId, db],
  );

  const songIds = useMemo(
    () => (setlist ? [...new Set(setlist.sets.flatMap((s) => s.songIds))] : []),
    [setlist],
  );
  const songs = useLiveQuery(async () => {
    const map = new Map<string, Song>();
    if (songIds.length === 0) return map;
    for (const song of await db.songs.bulkGet(songIds)) {
      if (song) map.set(song.id, song);
    }
    return map;
  }, [songIds, db]);

  const notation = useNotation();
  const printSetlist = useMemo(
    () =>
      setlist && songs
        ? buildPrintSetlist(setlist, songs, (key) => formatKey(key, notation))
        : undefined,
    [setlist, songs, notation],
  );

  // Browsers use the document title as the default PDF file name
  const name = setlist?.name;
  const modeLabel = t(mode === PrintMode.Booklet ? "print.booklet" : "print.sheet");
  useEffect(() => {
    if (!name) return;
    const previous = document.title;
    document.title = `${name} - ${modeLabel}`;
    return () => {
      document.title = previous;
    };
  }, [name, modeLabel]);

  let content: ReactNode;
  if (setlist === null) {
    content = (
      <div className="flex flex-col items-center gap-4 p-page">
        <p className="text-text-muted">{t("print.notFound")}</p>
        <Link to={Router.Setlists()} className="link-accent">
          {t("setlist.backToSetlists")}
        </Link>
      </div>
    );
  } else if (!setlist || !printSetlist) {
    content = <p className="p-page text-text-muted">{t("common.loading")}</p>;
  } else if (printSetlist.songCount === 0) {
    content = <p className="p-page text-text-muted">{t("techSheet.noSongs")}</p>;
  } else {
    content = (
      <div className="flex flex-col gap-6 overflow-x-auto px-4 py-6 print:block print:overflow-visible print:p-0">
        {mode === PrintMode.Booklet ? (
          <ChartBooklet setlist={setlist} printSetlist={printSetlist} />
        ) : (
          <StageSheet setlist={setlist} printSetlist={printSetlist} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg-raised print:bg-transparent">
      <PrintToolbar setlistId={setlistId} mode={mode} />
      {content}
    </div>
  );
}
