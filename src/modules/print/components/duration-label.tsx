import { formatDuration } from "@domain/format";
import { useTranslation } from "react-i18next";

interface DurationLabelProps {
  duration: number;
  unknownCount: number;
  /** Prefix with "Total". */
  total?: boolean;
}

/** "42:30" or "Total 42:30", plus how many songs have no duration. */
export function DurationLabel({ duration, unknownCount, total }: DurationLabelProps) {
  const { t } = useTranslation();
  if (duration === 0 && unknownCount === 0) return null;
  const formatted = formatDuration(duration);

  return (
    <span className="whitespace-nowrap">
      {duration > 0 && (total ? t("print.total", { duration: formatted }) : formatted)}
      {unknownCount > 0 && (
        <span className="text-[0.75em] font-normal text-text-muted">
          {" "}
          ({t("setlist.unknownDuration", { count: unknownCount })})
        </span>
      )}
    </span>
  );
}
