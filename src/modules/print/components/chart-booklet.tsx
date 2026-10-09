import type { Setlist } from "@db";
import { formatDuration } from "@domain/format";
import { formatSetlistDate, type PrintSetlist, type PrintSong } from "@domain/print";
import { useTranslation } from "react-i18next";
import { DurationLabel } from "./duration-label";
import { PrintChart } from "./print-chart";
import { PrintPaper } from "./print-paper";

interface ChartBookletProps {
  setlist: Setlist;
  printSetlist: PrintSetlist;
  /** "Part: 🎺 Trumpet (B♭)" when printing for one part. */
  partHeader?: string;
}

/** Contents page, then every chart in setlist order, each on a new page. */
export function ChartBooklet({ setlist, printSetlist, partHeader }: ChartBookletProps) {
  const { t, i18n } = useTranslation();
  const details = [setlist.date && formatSetlistDate(setlist.date, i18n.language), setlist.venue]
    .filter(Boolean)
    .join(" · ");
  const multipleSets = printSetlist.sets.length > 1;

  return (
    <>
      <PrintPaper style={{ fontSize: "12pt" }}>
        <h1 className="text-[2em] font-black leading-tight">{setlist.name}</h1>
        {partHeader && <p className="text-[1.25em] font-bold">{partHeader}</p>}
        {details && <p className="text-text-muted">{details}</p>}
        <p className="text-text-muted">
          {t("setlist.songCount", { count: printSetlist.songCount })}
          {" · "}
          <DurationLabel
            duration={printSetlist.duration}
            unknownCount={printSetlist.unknownDurationCount}
            total
          />
        </p>

        <h2 className="mt-[1.5em] mb-[0.5em] text-[1.1em] font-bold uppercase tracking-wider">
          {t("print.contents")}
        </h2>
        {printSetlist.sets.map((set, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: set names are not unique
          <div key={i} className="mb-[0.8em] break-inside-avoid">
            {multipleSets && (
              <h3 className="mb-[0.2em] flex justify-between gap-4 border-b border-border font-bold">
                <span>{set.name}</span>
                <DurationLabel duration={set.duration} unknownCount={set.unknownDurationCount} />
              </h3>
            )}
            <ol>
              {set.songs.map((entry) => (
                <li key={entry.number} className="grid grid-cols-[2em_1fr_auto] gap-x-[0.6em]">
                  <span className="text-right font-bold tabular-nums">{entry.number}.</span>
                  <span className="min-w-0">
                    {entry.song.title}
                    {entry.song.artist && (
                      <span className="text-text-muted"> — {entry.song.artist}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-text-muted">
                    {[entry.key, entry.song.bpm ? t("print.bpm", { bpm: entry.song.bpm }) : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </PrintPaper>

      {printSetlist.sets
        .flatMap((set) => set.songs)
        .map((entry) => (
          <PrintPaper key={entry.number} breakBefore style={{ fontSize: "12pt" }}>
            <ChartPage entry={entry} partHeader={partHeader} />
          </PrintPaper>
        ))}
    </>
  );
}

function ChartPage({ entry, partHeader }: { entry: PrintSong; partHeader?: string }) {
  const { t } = useTranslation();
  const { song, key, chart } = entry;

  return (
    <>
      <header className="mb-[0.8em] border-b-2 border-text pb-[0.4em]">
        <h2 className="flex items-baseline gap-[0.4em] text-[1.75em] font-black leading-tight">
          <span className="tabular-nums text-text-muted">{entry.number}</span>
          <span className="min-w-0">{song.title}</span>
        </h2>
        <p className="flex flex-wrap gap-x-[1em] text-text-muted">
          {song.artist && <span>{song.artist}</span>}
          {key && <span className="font-bold text-text">{t("print.key", { key })}</span>}
          {song.bpm ? <span>{t("print.bpm", { bpm: song.bpm })}</span> : null}
          {song.duration ? <span>{formatDuration(song.duration)}</span> : null}
          {/* Loose pages still say whose part they are */}
          {partHeader && <span className="ml-auto font-bold text-text">{partHeader}</span>}
        </p>
      </header>
      {chart.setup && (
        <p className="mb-[0.8em] whitespace-pre-wrap border border-text px-[0.5em] py-[0.2em] text-[1.1em] font-bold">
          {chart.setup}
        </p>
      )}
      {chart.sections.length > 0 ? (
        <PrintChart chart={chart} transposition={entry.transposition} />
      ) : (
        <p className="italic text-text-muted">{t("perform.noContent")}</p>
      )}
    </>
  );
}
