import { writeImportedSongs } from "@db/import-songs";
import { useDb } from "@db/provider";
import { createId } from "@domain/id";
import {
  buildImportWrites,
  type ImportPlan,
  type ImportWarning,
  MATCH_STRATEGIES,
  type MatchStrategy,
  parseSetlistHelperCsv,
  planImport,
  SetlistHelperFormatError,
} from "@domain/import/setlist-helper";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../shared/hooks/use-focus-trap";

interface SetlistHelperImportProps {
  disabled: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface Preview {
  plan: ImportPlan;
  warnings: ImportWarning[];
}

export function SetlistHelperImport({ disabled, onSuccess, onError }: SetlistHelperImportProps) {
  const { t } = useTranslation();
  const db = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { songs, warnings } = parseSetlistHelperCsv(bytes);
        const existing = await db.songs.toArray();
        setPreview({ plan: planImport(songs, existing), warnings });
      } catch (err) {
        onError(
          err instanceof SetlistHelperFormatError
            ? t("importSetlistHelper.invalidFile")
            : t("importSetlistHelper.failed"),
        );
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
          t("importSetlistHelper.success", {
            added: writes.added.length,
            updated: writes.updated.length,
          }),
        );
      } catch (err) {
        setPreview(null);
        onError(err instanceof Error ? err.message : t("importSetlistHelper.failed"));
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
        accept=".csv,.htm,.html,text/csv,text/html"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="btn btn-ghost"
      >
        {busy ? t("importSetlistHelper.reading") : t("importSetlistHelper.button")}
      </button>

      {preview && (
        <ImportPreviewModal
          preview={preview}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
    </>
  );
}

interface ImportPreviewModalProps {
  preview: Preview;
  busy: boolean;
  onConfirm: (strategy: MatchStrategy) => void;
  onCancel: () => void;
}

function ImportPreviewModal({ preview, busy, onConfirm, onCancel }: ImportPreviewModalProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true);
  const [strategy, setStrategy] = useState<MatchStrategy>(MATCH_STRATEGIES.skip);
  const { plan, warnings } = preview;
  const nothingToDo =
    plan.newSongs.length === 0 &&
    plan.fills.length === 0 &&
    (strategy === MATCH_STRATEGIES.skip || plan.matches.length === 0);

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
        aria-labelledby="sh-import-title"
        className="flex max-h-full w-full max-w-md flex-col gap-4 rounded-xl bg-bg p-6 shadow-xl"
      >
        <h2 id="sh-import-title" className="text-lg font-bold">
          {t("importSetlistHelper.previewTitle")}
        </h2>

        <ul className="flex flex-col gap-1 text-sm">
          <li className="text-accent">
            {t("importSetlistHelper.newCount", { count: plan.newSongs.length })}
          </li>
          {plan.fills.length > 0 && (
            <li className="text-accent">
              {t("importSetlistHelper.fillCount", { count: plan.fills.length })}
            </li>
          )}
          <li className="text-text-muted">
            {t("importSetlistHelper.matchCount", { count: plan.matches.length })}
          </li>
          <li className={warnings.length > 0 ? "text-warning" : "text-text-muted"}>
            {t("importSetlistHelper.warningCount", { count: warnings.length })}
          </li>
        </ul>

        {plan.matches.length > 0 && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 font-semibold">{t("importSetlistHelper.matchLegend")}</legend>
            {[MATCH_STRATEGIES.skip, MATCH_STRATEGIES.update].map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="sh-match-strategy"
                  value={value}
                  checked={strategy === value}
                  onChange={() => setStrategy(value)}
                />
                {t(`importSetlistHelper.strategy.${value}`)}
              </label>
            ))}
          </fieldset>
        )}

        {warnings.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded-sm border border-border p-2 text-xs text-text-muted">
            {warnings.map((w) => (
              <li key={`${w.row}:${w.code}`}>
                {t("importSetlistHelper.warningRow", { row: w.row, title: w.title ?? "" })}{" "}
                {t(`importSetlistHelper.warning.${w.code}`, { value: w.value ?? "" })}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-text-faint">{t("importSetlistHelper.safeNote")}</p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onConfirm(strategy)}
            disabled={busy || nothingToDo}
            className="btn btn-primary flex-1"
          >
            {busy ? t("importSetlistHelper.importing") : t("importSetlistHelper.confirm")}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost flex-1">
            {t("importSetlistHelper.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
