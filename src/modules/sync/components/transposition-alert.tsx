import type { TranspositionMismatch } from "@domain/sync/transposition-mismatch";
import { useTranslation } from "react-i18next";

interface TranspositionAlertProps {
  mismatches: TranspositionMismatch[];
  onDismiss: () => void;
}

function formatTransposition(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

export function TranspositionAlert({ mismatches, onDismiss }: TranspositionAlertProps) {
  const { t } = useTranslation();
  if (mismatches.length === 0) return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-yellow-500/40 bg-bg-raised px-4 py-3 shadow-lg">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-text">{t("sync.transpositionChanged")}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-text-faint hover:text-text"
          aria-label={t("common.close")}
        >
          ✕
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {mismatches.map((m) => (
          <li key={m.songId} className="text-sm text-text-muted">
            {t("sync.transpositionDetail", {
              title: m.songTitle,
              from: formatTransposition(m.localTransposition),
              to: formatTransposition(m.remoteTransposition),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
