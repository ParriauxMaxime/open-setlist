import type { Song } from "@db";
import { formatDuration } from "@domain/format";
import { useTranslation } from "react-i18next";

interface CrewSongRowProps {
  number: number;
  song: Song | undefined;
  techNote: string | undefined;
  current: boolean;
  onSelect: () => void;
}

/** One song for the booth: what comes, how long, the cue. No key: the crew does not need it. */
export function CrewSongRow({ number, song, techNote, current, onSelect }: CrewSongRowProps) {
  const { t } = useTranslation();

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={current ? "true" : undefined}
        className={`flex w-full gap-3 border-l-4 px-4 py-3 text-left transition-colors ${
          current ? "border-accent bg-accent-muted" : "border-transparent active:bg-bg-hover"
        }`}
      >
        <span className="w-6 shrink-0 pt-0.5 text-right text-sm tabular-nums text-text-faint">
          {number}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={`min-w-0 font-medium text-text ${current ? "text-lg" : "text-base"}`}>
              {song?.title ?? t("perform.songNotFound")}
              {song?.artist && (
                <span className="font-normal text-text-muted"> · {song.artist}</span>
              )}
            </span>
            <span className="flex shrink-0 gap-3 text-sm tabular-nums text-text-muted">
              {song?.duration ? <span>{formatDuration(song.duration)}</span> : null}
              {song?.bpm ? <span>{t("performTempo.bpmValue", { bpm: song.bpm })}</span> : null}
            </span>
          </span>
          {techNote && (
            <span className="whitespace-pre-wrap text-base text-accent">{techNote}</span>
          )}
        </span>
      </button>
    </li>
  );
}
