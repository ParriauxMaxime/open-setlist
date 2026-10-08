import { PRINT_MODES, type PrintMode } from "@domain/print";
import { Link } from "@swan-io/chicane";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

const MODE_KEYS: Record<PrintMode, string> = {
  sheet: "print.sheet",
  booklet: "print.booklet",
};

interface PrintToolbarProps {
  setlistId: string;
  mode: PrintMode;
}

export function PrintToolbar({ setlistId, mode }: PrintToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-bg-surface px-4 py-2 print:hidden">
      <Link to={Router.SetlistEdit({ setlistId })} className="link-accent text-sm">
        &larr; {t("print.backToSetlist")}
      </Link>
      <nav aria-label={t("print.modeLabel")} className="flex gap-2">
        {PRINT_MODES.map((m) => (
          <Link
            key={m}
            to={Router.Print({ setlistId, mode: m })}
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
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-xs text-text-faint lg:inline">{t("print.pdfHint")}</span>
        <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
          {t("print.printButton")}
        </button>
      </div>
    </div>
  );
}
