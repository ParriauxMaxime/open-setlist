import { writeImportedSongs } from "@db/import-songs";
import { useDb } from "@db/provider";
import { formatKey } from "@domain/chords/notation";
import { createId } from "@domain/id";
import {
  CHART_FILE_EXTENSIONS,
  type ChartFileWarning,
  type ImportedChart,
  parseChartFiles,
} from "@domain/import/chart-files";
import {
  buildImportWrites,
  type ImportPlan,
  MATCH_STRATEGIES,
  type MatchStrategy,
  planImport,
} from "@domain/import/setlist-helper";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../shared/hooks/use-focus-trap";
import { useNotation } from "../../shared/hooks/use-notation";

interface ChartFileImportProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface Preview {
  plan: ImportPlan<ImportedChart>;
  warnings: ChartFileWarning[];
}

const ACCEPT = [...CHART_FILE_EXTENSIONS, "text/plain"].join(",");

/** "Import files" button: ChordPro / text charts → preview → catalog. */
export function ChartFileImport({ onSuccess, onError }: ChartFileImportProps) {
  const { t } = useTranslation();
  const db = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = "";
      if (files.length === 0) return;
      setBusy(true);
      try {
        const read = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
          })),
        );
        const { songs, warnings } = parseChartFiles(read);
        if (songs.length === 0 && warnings.length === 0) {
          onError(t("chartImport.nothingFound"));
          return;
        }
        const existing = await db.songs.toArray();
        setPreview({ plan: planImport(songs, existing), warnings });
      } catch {
        onError(t("chartImport.failed"));
      } finally {
        setBusy(false);
      }
    },
    [db, t, onError],
  );

  const handleConfirm = useCallback(
    async (strategy: MatchStrategy) => {
      if (!preview) return;
      setBusy(true);
      try {
        const writes = buildImportWrites(preview.plan, strategy, Date.now(), () => createId());
        await writeImportedSongs(db, writes);
        setPreview(null);
        onSuccess(
          t("chartImport.success", { added: writes.added.length, updated: writes.updated.length }),
        );
      } catch (err) {
        setPreview(null);
        onError(err instanceof Error ? err.message : t("chartImport.failed"));
      } finally {
        setBusy(false);
      }
    },
    [db, preview, t, onSuccess, onError],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={handleFiles}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="btn btn-outline"
      >
        {busy ? t("chartImport.reading") : t("chartImport.importButton")}
      </button>

      {preview && (
        <ChartImportPreviewModal
          preview={preview}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
    </>
  );
}

interface ChartImportPreviewModalProps {
  preview: Preview;
  busy: boolean;
  onConfirm: (strategy: MatchStrategy) => void;
  onCancel: () => void;
}

function ChartImportPreviewModal({
  preview,
  busy,
  onConfirm,
  onCancel,
}: ChartImportPreviewModalProps) {
  const { t } = useTranslation();
  const notation = useNotation();
  const trapRef = useFocusTrap(true);
  const [strategy, setStrategy] = useState<MatchStrategy>(MATCH_STRATEGIES.skip);
  const { plan, warnings } = preview;
  const nothingToDo =
    plan.newSongs.length === 0 && (strategy === MATCH_STRATEGIES.skip || plan.matches.length === 0);

  const rows = [
    ...plan.newSongs.map((imported) => ({ imported, inCatalog: false })),
    ...plan.matches.map(({ imported }) => ({ imported, inCatalog: true })),
  ].sort((a, b) => a.imported.row - b.imported.row);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-import-title"
        className="flex max-h-full w-full max-w-lg flex-col gap-4 rounded-xl bg-bg p-6 shadow-xl"
      >
        <h2 id="chart-import-title" className="text-lg font-bold">
          {t("chartImport.previewTitle")}
        </h2>

        <ul className="flex flex-col gap-1 text-sm">
          <li className="text-accent">
            {t("chartImport.newCount", { count: plan.newSongs.length })}
          </li>
          <li className="text-text-muted">
            {t("chartImport.matchCount", { count: plan.matches.length })}
          </li>
          <li className={warnings.length > 0 ? "text-warning" : "text-text-muted"}>
            {t("chartImport.warningCount", { count: warnings.length })}
          </li>
        </ul>

        {rows.length > 0 && (
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-sm border border-border text-sm">
            {rows.map(({ imported, inCatalog }) => (
              <li key={imported.row} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{imported.song.title}</p>
                  <p className="truncate text-xs text-text-muted">
                    {imported.song.artist}
                    {imported.song.key && (
                      <span className="text-chord">
                        {imported.song.artist ? " · " : ""}
                        {formatKey(imported.song.key, notation)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-text-faint">
                    {imported.file}
                    {imported.converted ? ` · ${t("chartImport.convertedBadge")}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs ${inCatalog ? "text-text-muted" : "text-accent"}`}
                >
                  {inCatalog ? t("chartImport.statusMatch") : t("chartImport.statusNew")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {plan.matches.length > 0 && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 font-semibold">{t("chartImport.matchLegend")}</legend>
            {[MATCH_STRATEGIES.skip, MATCH_STRATEGIES.update].map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="chart-match-strategy"
                  value={value}
                  checked={strategy === value}
                  onChange={() => setStrategy(value)}
                />
                {t(`chartImport.strategy.${value}`)}
              </label>
            ))}
          </fieldset>
        )}

        {warnings.length > 0 && (
          <ul className="max-h-32 shrink-0 overflow-y-auto rounded-sm border border-border p-2 text-xs text-text-muted">
            {warnings.map((w) => (
              <li key={`${w.file}:${w.title ?? ""}:${w.code}:${w.value ?? ""}`}>
                <span className="text-text">{w.file}</span>
                {w.title ? ` · ${w.title}` : ""}:{" "}
                {t(`chartImport.warning.${w.code}`, { value: w.value ?? "" })}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-text-faint">{t("chartImport.safeNote")}</p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onConfirm(strategy)}
            disabled={busy || nothingToDo}
            className="btn btn-primary flex-1"
          >
            {busy ? t("chartImport.importing") : t("chartImport.confirm")}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost flex-1">
            {t("chartImport.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
