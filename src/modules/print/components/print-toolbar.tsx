import { ALL_PARTS } from "@domain/parts";
import { PRINT_MODES, type PrintMode, parsePrintPart } from "@domain/print";
import { Link } from "@swan-io/chicane";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { usePartName } from "../hooks/use-part-name";

const MODE_KEYS: Record<PrintMode, string> = {
  sheet: "print.sheet",
  booklet: "print.booklet",
};

interface PrintToolbarProps {
  setlistId: string;
  mode: PrintMode;
  /** Part printed for, undefined for all parts (concert pitch). */
  part: string | undefined;
  /** Parts to pick from, besides "All parts". */
  partChoices: string[];
}

export function PrintToolbar({ setlistId, mode, part, partChoices }: PrintToolbarProps) {
  const { t } = useTranslation();
  const partName = usePartName();

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-bg-surface px-4 py-2 print:hidden">
      <Link to={Router.SetlistEdit({ setlistId })} className="link-accent text-sm">
        &larr; {t("print.backToSetlist")}
      </Link>
      <nav aria-label={t("print.modeLabel")} className="flex gap-2">
        {PRINT_MODES.map((m) => (
          <Link
            key={m}
            to={Router.Print({ setlistId, mode: m, part })}
            aria-current={m === mode ? "page" : undefined}
            className={[
              "rounded-md border px-3 py-1 text-sm transition-colors",
              m === mode
                ? "border-accent bg-accent-muted text-accent"
                : "border-border text-text-muted hover:border-text-faint hover:text-text",
            ].join(" ")}
          >
            {t(MODE_KEYS[m])}
          </Link>
        ))}
      </nav>
      <label className="flex items-center gap-2 text-sm text-text-muted">
        {t("print.part")}
        <select
          className="field-sm"
          value={part ?? ALL_PARTS}
          onChange={(e) =>
            Router.replace("Print", { setlistId, mode, part: parsePrintPart(e.target.value) })
          }
        >
          <option value={ALL_PARTS}>{t("print.allParts")}</option>
          {partChoices.map((p) => (
            <option key={p} value={p}>
              {partName(p)}
            </option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-xs text-text-faint lg:inline">{t("print.pdfHint")}</span>
        <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
          {t("print.printButton")}
        </button>
      </div>
    </div>
  );
}
