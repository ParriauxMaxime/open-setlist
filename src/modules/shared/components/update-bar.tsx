import { applyAppUpdate } from "@domain/pwa/sw-update";
import { useTranslation } from "react-i18next";
import { useAppUpdateReady } from "../hooks/use-app-update";

/** "A new version is ready · Reload", on the admin pages only: the stage never reloads by itself. */
export function UpdateBar() {
  const { t } = useTranslation();
  const ready = useAppUpdateReady();
  if (!ready) return null;
  return (
    <div
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-accent/30 bg-accent-muted px-3 py-1.5 text-sm text-text"
    >
      <span>{t("appUpdate.ready")}</span>
      <span aria-hidden="true" className="text-text-faint">
        ·
      </span>
      <button
        type="button"
        onClick={applyAppUpdate}
        className="font-medium text-accent hover:text-accent-hover hover:underline"
      >
        {t("appUpdate.reload")}
      </button>
    </div>
  );
}
