import type { Song } from "@db";
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

  return (
    <div className="flex flex-1 items-baseline gap-2 truncate text-sm">
      <span className="truncate">{song.title}</span>
      {song.artist && <span className="shrink-0 text-xs text-text-faint">{song.artist}</span>}
      {song.key && <span className="shrink-0 text-xs text-chord">({song.key})</span>}
    </div>
  );
}
