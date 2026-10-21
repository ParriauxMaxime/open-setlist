import type { ChartImportSummary as Summary } from "@domain/import/chart-import";
import { useTranslation } from "react-i18next";
import { Disclosure } from "../../design-system/components/card";

interface ChartImportSummaryProps {
  summary: Summary;
  onDismiss: () => void;
}

/** What an import did: songs added and updated, files left out and why. */
export function ChartImportSummary({ summary, onDismiss }: ChartImportSummaryProps) {
  const { t } = useTranslation();
  const { added, updated, skipped, notes } = summary;
  const headline = [
    t("chartImport.summary.added", { count: added }),
    ...(updated > 0 ? [t("chartImport.summary.updated", { count: updated })] : []),
    ...(skipped.length > 0 ? [t("chartImport.summary.skipped", { count: skipped.length })] : []),
  ].join(", ");

  return (
    <section
      aria-live="polite"
      className="mb-4 rounded-lg border border-border bg-bg-surface px-4 py-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 font-medium text-text">{headline}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("common.close")}
          className="shrink-0 p-0.5 text-text-faint hover:text-text"
        >
          ✕
        </button>
      </div>
      {skipped.length > 0 && (
        <ul className="mt-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-xs text-text-muted">
          {skipped.map(({ file, title, reason }) => (
            <li key={`${file}:${title ?? ""}:${reason}`}>
              <span className="text-text">{file}</span>
              {title ? ` · ${title}` : ""}: {t(`chartImport.skipReason.${reason}`)}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <Disclosure
          summary={t("chartImport.summary.notes", { count: notes.length })}
          className="mt-2"
        >
          <ul className="flex flex-col gap-0.5 text-xs text-text-muted">
            {notes.map((w) => (
              <li key={`${w.file}:${w.title ?? ""}:${w.code}:${w.value ?? ""}`}>
                <span className="text-text">{w.file}</span>
                {w.title ? ` · ${w.title}` : ""}:{" "}
                {t(`chartImport.warning.${w.code}`, { value: w.value ?? "" })}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  );
}
