import { resolveSongStatus, SongStatus, songStatusLabelKey } from "@domain/song-status";
import { useTranslation } from "react-i18next";

const DOT_CLASS: Record<SongStatus, string> = {
  [SongStatus.Idea]: "bg-status-idea",
  [SongStatus.Rehearsing]: "bg-status-rehearsing",
  [SongStatus.Ready]: "bg-status-ready",
  [SongStatus.Retired]: "bg-status-retired",
};

interface SongStatusDotProps {
  status: SongStatus | undefined;
  /** Show the status name next to the dot (otherwise it is only a tooltip). */
  withLabel?: boolean;
  /** Hide the label below the md breakpoint. */
  labelHiddenOnMobile?: boolean;
}

export function SongStatusDot({ status, withLabel, labelHiddenOnMobile }: SongStatusDotProps) {
  const { t } = useTranslation();
  const resolved = resolveSongStatus(status);
  const label = t(songStatusLabelKey(resolved));
  const dot = `inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[resolved]}`;

  if (!withLabel) {
    return <span role="img" aria-label={label} title={label} className={dot} />;
  }

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span aria-hidden="true" className={dot} />
      <span className={labelHiddenOnMobile ? "sr-only md:not-sr-only" : undefined}>{label}</span>
    </span>
  );
}
