import { isSongNotReady, type SongStatus, songStatusLabelKey } from "@domain/song-status";
import { useTranslation } from "react-i18next";

/** Warning shown on setlist rows for songs still being learned. Renders nothing otherwise. */
export function NotReadyBadge({ status }: { status: SongStatus | undefined }) {
  const { t } = useTranslation();
  if (!status || !isSongNotReady(status)) return null;

  return (
    <span
      title={t("songStatus.notReadyHint")}
      className="shrink-0 rounded-sm bg-warning/15 px-1 text-xs text-warning"
    >
      ⚠ {t(songStatusLabelKey(status))}
    </span>
  );
}
