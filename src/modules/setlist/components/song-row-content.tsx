import type { Song } from "@db";
import { formatKey } from "@domain/chords/notation";
import { formatDuration } from "@domain/format";
import { useTranslation } from "react-i18next";
import { SongStatusDot } from "../../shared/components/song-status-dot";
import { useNotation } from "../../shared/hooks/use-notation";
import { NotReadyBadge } from "./not-ready-badge";

interface SongRowContentProps {
  song: Song | undefined;
  /** "dot" on every song (catalog panel), "warning" only on songs not ready (sets). */
  statusIndicator: "dot" | "warning";
}

export function SongRowContent({ song, statusIndicator }: SongRowContentProps) {
  const { t } = useTranslation();
  const notation = useNotation();

  if (!song) {
    return (
      <span className="flex-1 truncate text-sm italic text-text-faint">{t("common.unknown")}</span>
    );
  }

  const details = [
    song.key ? formatKey(song.key, notation) : null,
    song.bpm ? `${song.bpm} bpm` : null,
    song.duration ? formatDuration(song.duration) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-1 flex-col gap-0.5 truncate text-sm md:flex-row md:items-baseline md:gap-2">
      <div className="flex items-baseline gap-2 truncate">
        {statusIndicator === "dot" && (
          <span className="self-center">
            <SongStatusDot status={song.status} />
          </span>
        )}
        <span className="truncate">{song.title}</span>
        {song.artist && <span className="shrink-0 text-xs text-text-faint">{song.artist}</span>}
        {statusIndicator === "warning" && <NotReadyBadge status={song.status} />}
      </div>
      {details && <span className="shrink-0 text-xs text-text-faint md:ml-auto">{details}</span>}
    </div>
  );
}
