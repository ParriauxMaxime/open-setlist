import type { Song } from "@db";
import { formatDuration } from "@domain/format";
import { useTranslation } from "react-i18next";

interface SongRowContentProps {
  song: Song | undefined;
}

export function SongRowContent({ song }: SongRowContentProps) {
  const { t } = useTranslation();

  if (!song) {
    return (
      <span className="flex-1 truncate text-sm italic text-text-faint">{t("common.unknown")}</span>
    );
  }

  const details = [
    song.key,
    song.bpm ? `${song.bpm} bpm` : null,
    song.duration ? formatDuration(song.duration) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-1 flex-col gap-0.5 truncate text-sm md:flex-row md:items-baseline md:gap-2">
      <div className="flex items-baseline gap-2 truncate">
        <span className="truncate">{song.title}</span>
        {song.artist && <span className="shrink-0 text-xs text-text-faint">{song.artist}</span>}
      </div>
      {details && <span className="shrink-0 text-xs text-text-faint md:ml-auto">{details}</span>}
    </div>
  );
}
