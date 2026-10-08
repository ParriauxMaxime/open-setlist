import type { Setlist } from "@db";
import {
  formatSetlistDate,
  type PrintSetlist,
  type PrintSong,
  sheetTitleSize,
} from "@domain/print";
import { useTranslation } from "react-i18next";
import { DurationLabel } from "./duration-label";
import { PrintPaper } from "./print-paper";

interface StageSheetProps {
  setlist: Setlist;
  printSetlist: PrintSetlist;
}

/** Floor setlist: one page per set, titles as big as the set allows. */
export function StageSheet({ setlist, printSetlist }: StageSheetProps) {
  const { i18n } = useTranslation();
  const details = [
    setlist.name,
    setlist.date && formatSetlistDate(setlist.date, i18n.language),
    setlist.venue,
  ]
    .filter(Boolean)
    .join(" · ");

  return printSetlist.sets.map((set, i) => {
    const titlePt = sheetTitleSize(
      set.songs.map((entry) => ({ title: entry.song.title, hasSetup: Boolean(entry.chart.setup) })),
    );

    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: set names are not unique
      <PrintPaper key={i} breakBefore={i > 0}>
        <header className="mb-[10pt]">
          <div className="flex justify-between gap-4 text-[11pt] leading-snug text-text-muted">
            <span className="min-w-0 truncate">{details}</span>
            <DurationLabel
              duration={printSetlist.duration}
              unknownCount={printSetlist.unknownDurationCount}
              total
            />
          </div>
          <h2 className="mt-[4pt] flex items-baseline justify-between gap-4 border-b-2 border-text pb-[4pt] text-[24pt] font-black leading-tight">
            <span className="min-w-0 truncate">{set.name}</span>
            <DurationLabel duration={set.duration} unknownCount={set.unknownDurationCount} />
          </h2>
        </header>
        <ol style={{ fontSize: `${titlePt}pt` }}>
          {set.songs.map((entry) => (
            <SheetRow key={entry.number} entry={entry} />
          ))}
        </ol>
      </PrintPaper>
    );
  });
}

function SheetRow({ entry }: { entry: PrintSong }) {
  const { t } = useTranslation();
  const { song, key, chart } = entry;

  return (
    <li className="grid break-inside-avoid grid-cols-[1.1em_1fr_auto] items-baseline gap-x-[0.3em] border-b border-border py-[0.125em]">
      <span className="text-right text-[0.6em] font-bold leading-none tabular-nums text-text-muted">
        {entry.number}
      </span>
      <div className="min-w-0">
        <div className="break-words font-black leading-[1.1]">{song.title}</div>
        {chart.setup && (
          <div className="whitespace-pre-wrap text-[0.4em] font-semibold leading-[1.25] text-text-muted">
            {chart.setup}
          </div>
        )}
      </div>
      {/* Top-aligned and no taller than a title line, so it never grows the row */}
      <div className="self-start whitespace-nowrap text-right leading-[1.2]">
        {key && <div className="text-[0.5em] font-bold">{key}</div>}
        {song.bpm ? (
          <div className="text-[0.4em] font-semibold text-text-muted">
            {t("print.bpm", { bpm: song.bpm })}
          </div>
        ) : null}
      </div>
    </li>
  );
}
