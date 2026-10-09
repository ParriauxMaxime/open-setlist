import { parse } from "@domain/chordpro/parser";
import { formatKey } from "@domain/chords/notation";
import {
  CHART_INSERT_MODES,
  type ChartInsertMode,
  chartHasLyrics,
  convertChartText,
  type FilledFields,
  insertChart,
} from "@domain/import/chart-text";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../shared/hooks/use-focus-trap";
import { useNotation } from "../../shared/hooks/use-notation";
import { tokenizeLine } from "./chordpro-editor";

interface PasteChartModalProps {
  /** Current editor content: the chart is merged into it without losing song details. */
  existing: string;
  /** Current form values: filled fields are not overwritten by the chart's metadata. */
  filled: FilledFields;
  onInsert: (content: string) => void;
  onClose: () => void;
}

const DETECTED_FIELDS = ["title", "artist", "key", "capo", "bpm"] as const;

export function PasteChartModal({ existing, filled, onInsert, onClose }: PasteChartModalProps) {
  const { t } = useTranslation();
  const notation = useNotation();
  const trapRef = useFocusTrap(true);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const sourceId = useId();
  const [source, setSource] = useState("");

  const converted = useMemo(() => (source.trim() ? convertChartText(source) : null), [source]);
  const detected = useMemo(() => (converted ? parse(converted.content).metadata : {}), [converted]);
  const hasLyrics = chartHasLyrics(existing);

  useEffect(() => {
    sourceRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const insert = (mode: ChartInsertMode) => {
    if (converted) onInsert(insertChart(existing, converted.content, mode, filled));
  };

  return (
    <div
      ref={trapRef as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-chart-title"
      className="fixed inset-0 z-50 flex flex-col bg-bg"
    >
      <div className="flex items-center justify-between border-b border-border p-page">
        <h2 id="paste-chart-title" className="text-lg font-bold">
          {t("chartImport.pasteTitle")}
        </h2>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
          {t("common.close")}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-page">
        <p className="text-sm text-text-muted">{t("chartImport.pasteHint")}</p>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-64 flex-col gap-1">
            <label htmlFor={sourceId} className="text-sm font-medium text-text-muted">
              {t("chartImport.pasteLabel")}
            </label>
            <textarea
              id={sourceId}
              ref={sourceRef}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("chartImport.pastePlaceholder")}
              wrap="off"
              spellCheck={false}
              className="field min-h-0 flex-1 resize-none whitespace-pre font-mono text-sm"
            />
          </div>

          <div className="flex min-h-64 flex-col gap-1">
            <span className="text-sm font-medium text-text-muted">
              {t("chartImport.previewLabel")}
            </span>
            {converted ? (
              <ChordProPreview content={converted.content} />
            ) : (
              <p className="flex-1 rounded-md border border-dashed border-border p-3 text-sm text-text-faint">
                {t("chartImport.previewEmpty")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border p-page">
        {converted && (
          <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-text-muted">
              {converted.alreadyChordPro
                ? t("chartImport.alreadyChordPro")
                : t("chartImport.converted")}
            </span>
            {DETECTED_FIELDS.map((field) => {
              const value = detected[field];
              if (!value) return null;
              return (
                <span key={field} className="rounded-sm bg-bg-raised px-2 py-0.5 text-text">
                  {t(`chartImport.field.${field}`)}:{" "}
                  {field === "key" ? formatKey(value, notation) : value}
                </span>
              );
            })}
          </div>
        )}
        {hasLyrics && <p className="text-xs text-text-faint">{t("chartImport.existingHint")}</p>}
        <div className="flex flex-wrap gap-3">
          {hasLyrics ? (
            <>
              <button
                type="button"
                disabled={!converted}
                onClick={() => insert(CHART_INSERT_MODES.replace)}
                className="btn btn-primary"
              >
                {t("chartImport.replace")}
              </button>
              <button
                type="button"
                disabled={!converted}
                onClick={() => insert(CHART_INSERT_MODES.append)}
                className="btn btn-outline"
              >
                {t("chartImport.append")}
              </button>
            </>
          ) : (
            // No lyrics yet: "append" keeps the song's directives (title, setup comment…)
            <button
              type="button"
              disabled={!converted}
              onClick={() => insert(CHART_INSERT_MODES.append)}
              className="btn btn-primary"
            >
              {t("chartImport.insert")}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t("chartImport.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Read-only ChordPro with the editor's chord/directive colors. */
function ChordProPreview({ content }: { content: string }) {
  return (
    <pre className="chordpro-highlight min-h-0 flex-1 overflow-auto whitespace-pre rounded-md border border-border bg-bg-surface">
      {content.split("\n").map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of a derived, read-only preview
        <Fragment key={i}>
          {tokenizeLine(line).map((token, j) =>
            token.type === "text" ? (
              token.value
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens of a derived, read-only line
              <span key={j} className={`cphl-${token.type}`}>
                {token.value}
              </span>
            ),
          )}
          {"\n"}
        </Fragment>
      ))}
    </pre>
  );
}
