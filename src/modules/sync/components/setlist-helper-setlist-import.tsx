import { importSetlists } from "@db/import-setlists";
import { useDb } from "@db/provider";
import { createId } from "@domain/id";
import { SetlistHelperFormatError } from "@domain/import/setlist-helper";
import {
  type ParsedSetlistFile,
  parseSetlistHelperSetlistCsv,
  planSetlistFile,
  type SetlistFilePlan,
  setlistNameFromFileName,
  UNMATCHED_ACTIONS,
  type UnmatchedAction,
} from "@domain/import/setlist-helper-setlist";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Input } from "../../design-system/components/form";
import { useFocusTrap } from "../../shared/hooks/use-focus-trap";

interface SetlistHelperSetlistImportProps {
  disabled: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface FileCard {
  key: string;
  fileName: string;
  name: string;
  date: string;
  venue: string;
  parsed: ParsedSetlistFile;
  plan: SetlistFilePlan;
}

interface Preview {
  cards: FileCard[];
  /** File names that could not be read as a setlist export. */
  invalid: string[];
}

export function SetlistHelperSetlistImport({
  disabled,
  onSuccess,
  onError,
}: SetlistHelperSetlistImportProps) {
  const { t } = useTranslation();
  const db = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      setBusy(true);
      try {
        const catalog = await db.songs.toArray();
        const next: Preview = { cards: [], invalid: [] };
        for (const [i, file] of files.entries()) {
          try {
            const parsed = parseSetlistHelperSetlistCsv(new Uint8Array(await file.arrayBuffer()));
            next.cards.push({
              key: `${i}:${file.name}`,
              fileName: file.name,
              name: setlistNameFromFileName(file.name) || t("importSetlists.defaultName"),
              date: "",
              venue: "",
              parsed,
              plan: planSetlistFile(parsed, catalog),
            });
          } catch (err) {
            if (!(err instanceof SetlistHelperFormatError)) throw err;
            next.invalid.push(file.name);
          }
        }
        if (next.cards.length === 0) onError(t("importSetlists.invalidFile"));
        else setPreview(next);
      } catch {
        onError(t("importSetlists.failed"));
      } finally {
        setBusy(false);
      }
    },
    [db, t, onError],
  );

  const handleConfirm = useCallback(
    async (action: UnmatchedAction) => {
      if (!preview) return;
      setBusy(true);
      try {
        const files = preview.cards.map(({ name, date, venue, parsed }) => ({
          name,
          date,
          venue,
          parsed,
        }));
        const writes = await importSetlists(db, files, action, () => createId());
        setPreview(null);
        onSuccess(
          t("importSetlists.success", {
            count: writes.setlists.length,
            songs: writes.songs.length,
          }),
        );
      } catch (err) {
        setPreview(null);
        onError(err instanceof Error ? err.message : t("importSetlists.failed"));
      } finally {
        setBusy(false);
      }
    },
    [db, preview, t, onSuccess, onError],
  );

  const updateCard = useCallback((key: string, patch: Partial<FileCard>) => {
    setPreview((prev) =>
      prev
        ? { ...prev, cards: prev.cards.map((c) => (c.key === key ? { ...c, ...patch } : c)) }
        : prev,
    );
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="btn btn-ghost"
      >
        {busy ? t("importSetlists.reading") : t("importSetlists.button")}
      </button>

      {preview && (
        <SetlistImportModal
          preview={preview}
          busy={busy}
          onChange={updateCard}
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
    </>
  );
}

interface SetlistImportModalProps {
  preview: Preview;
  busy: boolean;
  onChange: (key: string, patch: Partial<FileCard>) => void;
  onConfirm: (action: UnmatchedAction) => void;
  onCancel: () => void;
}

function SetlistImportModal({
  preview,
  busy,
  onChange,
  onConfirm,
  onCancel,
}: SetlistImportModalProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true);
  const [action, setAction] = useState<UnmatchedAction>(UNMATCHED_ACTIONS.create);
  const { cards, invalid } = preview;
  const hasUnmatched = cards.some((c) => c.plan.unmatched > 0);
  const missingName = cards.some((c) => c.name.trim() === "");

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
        aria-labelledby="sh-setlist-import-title"
        className="flex max-h-full w-full max-w-lg flex-col gap-4 rounded-xl bg-bg p-6 shadow-xl"
      >
        <h2 id="sh-setlist-import-title" className="text-lg font-bold">
          {t("importSetlists.previewTitle")}
        </h2>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {cards.map((card) => (
            <section
              key={card.key}
              aria-label={card.fileName}
              className="flex flex-col gap-2 rounded-sm border border-border p-3"
            >
              <p className="truncate text-xs text-text-faint">{card.fileName}</p>
              <Field
                label={t("setlist.nameLabel")}
                error={card.name.trim() === "" ? "Name is required" : undefined}
              >
                <Input
                  value={card.name}
                  onChange={(e) => onChange(card.key, { name: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("setlist.dateLabel")}>
                  <Input
                    type="date"
                    value={card.date}
                    onChange={(e) => onChange(card.key, { date: e.target.value })}
                  />
                </Field>
                <Field label={t("setlist.venueLabel")}>
                  <Input
                    value={card.venue}
                    placeholder={t("setlist.venuePlaceholder")}
                    onChange={(e) => onChange(card.key, { venue: e.target.value })}
                  />
                </Field>
              </div>
              <ul className="flex flex-col gap-0.5 text-sm">
                <li className="text-text-muted">
                  {t("importSetlists.matchedCount", { count: card.plan.matched })}
                </li>
                <li className={card.plan.unmatched > 0 ? "text-accent" : "text-text-muted"}>
                  {t("importSetlists.unmatchedCount", { count: card.plan.unmatched })}
                </li>
                <li className={card.plan.warnings.length > 0 ? "text-warning" : "text-text-muted"}>
                  {t("importSetlistHelper.warningCount", { count: card.plan.warnings.length })}
                </li>
              </ul>
              {card.plan.warnings.length > 0 && (
                <ul className="max-h-32 overflow-y-auto rounded-sm border border-border p-2 text-xs text-text-muted">
                  {card.plan.warnings.map((w) => (
                    <li key={`${w.row}:${w.code}`}>
                      {t("importSetlistHelper.warningRow", { row: w.row, title: w.title ?? "" })}{" "}
                      {t(`importSetlistHelper.warning.${w.code}`, { value: w.value ?? "" })}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {invalid.length > 0 && (
          <p className="text-xs text-warning">
            {t("importSetlists.invalidFiles", { files: invalid.join(", ") })}
          </p>
        )}

        {hasUnmatched && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 font-semibold">{t("importSetlists.unmatchedLegend")}</legend>
            {[UNMATCHED_ACTIONS.create, UNMATCHED_ACTIONS.skip].map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="sh-unmatched-action"
                  value={value}
                  checked={action === value}
                  onChange={() => setAction(value)}
                />
                {t(`importSetlists.action.${value}`)}
              </label>
            ))}
          </fieldset>
        )}

        <p className="text-xs text-text-faint">{t("importSetlists.tip")}</p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onConfirm(action)}
            disabled={busy || missingName}
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
