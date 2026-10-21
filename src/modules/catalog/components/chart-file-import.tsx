import { writeImportedSongs } from "@db/import-songs";
import { useDb } from "@db/provider";
import { createId } from "@domain/id";
import {
  CHART_FILE_EXTENSIONS,
  type ChartFileWarning,
  type ImportedChart,
  parseChartFiles,
} from "@domain/import/chart-files";
import {
  buildChartImportWrites,
  type ChartImportSummary,
  planChartImport,
  summarizeChartImport,
} from "@domain/import/chart-import";
import type { ImportPlan } from "@domain/import/setlist-helper";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../../design-system/components/confirm-modal";

interface ChartFileImportProps {
  onDone: (summary: ChartImportSummary) => void;
  onError: (message: string) => void;
}

interface ParsedImport {
  plan: ImportPlan<ImportedChart>;
  warnings: ChartFileWarning[];
}

const ACCEPT = [...CHART_FILE_EXTENSIONS, "text/plain"].join(",");

/** Titles named in the question about existing songs, the rest as "…". */
const NAMED_EXISTING = 3;

/** "Import files" button: ChordPro / text charts → catalog, asking once about songs it has. */
export function ChartFileImport({ onDone, onError }: ChartFileImportProps) {
  const { t } = useTranslation();
  const db = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [askExisting, setAskExisting] = useState<ParsedImport | null>(null);
  const [busy, setBusy] = useState(false);

  const write = useCallback(
    async ({ plan, warnings }: ParsedImport, replaceExisting: boolean) => {
      setAskExisting(null);
      setBusy(true);
      try {
        const writes = buildChartImportWrites(plan, replaceExisting, Date.now(), createId);
        await writeImportedSongs(db, writes);
        onDone(summarizeChartImport(writes, warnings, replaceExisting ? [] : plan.matches));
      } catch (err) {
        onError(err instanceof Error ? err.message : t("chartImport.failed"));
      } finally {
        setBusy(false);
      }
    },
    [db, t, onDone, onError],
  );

  const handleFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = "";
      if (files.length === 0) return;
      setBusy(true);
      let parsed: ParsedImport;
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
        parsed = { plan: planChartImport(songs, await db.songs.toArray()), warnings };
      } catch {
        onError(t("chartImport.failed"));
        return;
      } finally {
        setBusy(false);
      }
      if (parsed.plan.matches.length > 0) setAskExisting(parsed);
      else await write(parsed, false);
    },
    [db, t, onError, write],
  );

  const existingTitles = askExisting?.plan.matches.map(({ existing }) => existing.title) ?? [];

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
        title={t("chartImport.safeNote")}
        className="btn btn-outline"
      >
        {busy ? t("chartImport.reading") : t("chartImport.importButton")}
      </button>

      {askExisting && (
        <ConfirmModal
          title={t("chartImport.existingTitle", { count: existingTitles.length })}
          message={t("chartImport.existingMessage", {
            count: existingTitles.length,
            titles: [
              ...existingTitles.slice(0, NAMED_EXISTING),
              ...(existingTitles.length > NAMED_EXISTING ? ["…"] : []),
            ].join(", "),
          })}
          confirmLabel={t("chartImport.replaceExisting")}
          cancelLabel={t("chartImport.skipExisting")}
          onConfirm={() => write(askExisting, true)}
          onCancel={() => write(askExisting, false)}
          onDismiss={() => setAskExisting(null)}
        />
      )}
    </>
  );
}
