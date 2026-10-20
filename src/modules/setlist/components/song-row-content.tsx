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
  /** Show "–:–" for a song without a length (sets, where lengths add up to the total). */
  markMissingLength?: boolean;
}

export function SongRowContent({ song, statusIndicator, markMissingLength }: SongRowContentProps) {
  const { t } = useTranslation();
  const notation = useNotation();

  if (!song) {
    return (
      <span className="flex-1 truncate text-sm italic text-text-faint">{t("common.unknown")}</span>
    );
  }

  const missingLength = markMissingLength && !song.duration;
  const details = [
    song.key ? formatKey(song.key, notation) : null,
    song.bpm ? `${song.bpm} bpm` : null,
    song.duration ? formatDuration(song.duration) : missingLength ? "–:–" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // In a narrow row the title gets the whole line: the artist joins the details below it
  const secondLine = [song.artist, details].filter(Boolean).join(" · ");

  return (
    <div className="@container min-w-0 flex-1">
      <div className="flex flex-col gap-0.5 text-sm @lg:flex-row @lg:items-baseline @lg:gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          {statusIndicator === "dot" && (
            <span className="shrink-0 self-center">
              <SongStatusDot status={song.status} />
            </span>
          )}
          <span className="min-w-0 truncate">{song.title}</span>
          {song.artist && (
            <span className="hidden min-w-0 shrink-[100] truncate text-xs text-text-faint @lg:inline">
              {song.artist}
            </span>
          )}
          {statusIndicator === "warning" && <NotReadyBadge status={song.status} />}
        </div>
        {secondLine && (
          <span
            title={missingLength ? t("setlist.noLength") : undefined}
            className="truncate text-xs text-text-faint @lg:hidden"
          >
            {secondLine}
          </span>
        )}
        {details && (
          <span
            title={missingLength ? t("setlist.noLength") : undefined}
            className="hidden shrink-0 text-xs text-text-faint @lg:ml-auto @lg:inline"
          >
            {details}
          </span>
        )}
      </div>
    </div>
  );
}
