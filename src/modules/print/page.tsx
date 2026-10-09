import type { Song } from "@db";
import { useDb } from "@db/provider";
import { formatKey } from "@domain/chords/notation";
import { loadPreferences, resolvePartView } from "@domain/preferences";
import { buildPrintSetlist, PrintMode, parsePrintPart, printPartChoices } from "@domain/print";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { useNotation } from "../shared/hooks/use-notation";
import { ChartBooklet } from "./components/chart-booklet";
import { PrintToolbar } from "./components/print-toolbar";
import { StageSheet } from "./components/stage-sheet";
import { usePartName } from "./hooks/use-part-name";

interface PrintPageProps {
  setlistId: string;
  mode?: PrintMode;
  /** `?part=`: one musician's charts (booklet) and keys at their written pitch. */
  part?: string;
}

export function PrintPage({ setlistId, mode = PrintMode.Sheet, part: rawPart }: PrintPageProps) {
  const part = parsePrintPart(rawPart);
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
        ? buildPrintSetlist(setlist, songs, (key) => formatKey(key, notation), part)
        : undefined,
    [setlist, songs, notation, part],
  );

  // The device's "My part" is always offered, even when no song has a section for it
  const [devicePart] = useState(() => resolvePartView(loadPreferences()).instrument);
  const partChoices = useMemo(
    () => printPartChoices(songs?.values() ?? [], [devicePart, part]),
    [songs, devicePart, part],
  );
  const partName = usePartName();
  const partHeader = part ? t("print.partHeader", { part: partName(part) }) : undefined;

  // Browsers use the document title as the default PDF file name
  const name = setlist?.name;
  const modeLabel = t(mode === PrintMode.Booklet ? "print.booklet" : "print.sheet");
  const partTitle = part ? partName(part, false) : undefined;
  useEffect(() => {
    if (!name) return;
    const previous = document.title;
    document.title = [name, modeLabel, partTitle].filter(Boolean).join(" - ");
    return () => {
      document.title = previous;
    };
  }, [name, modeLabel, partTitle]);

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
          <ChartBooklet setlist={setlist} printSetlist={printSetlist} partHeader={partHeader} />
        ) : (
          <StageSheet setlist={setlist} printSetlist={printSetlist} partHeader={partHeader} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg-raised print:bg-transparent">
      <PrintToolbar setlistId={setlistId} mode={mode} part={part} partChoices={partChoices} />
      {content}
    </div>
  );
}
