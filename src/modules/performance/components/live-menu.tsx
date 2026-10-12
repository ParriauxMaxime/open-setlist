import { LIVE_MODE, LIVE_MODE_VALUES, LIVE_STATE } from "@domain/sync/live";
import { useTranslation } from "react-i18next";
import type { LiveSession } from "../hooks/use-live-session";
import { choiceClass } from "./my-part-menu";

/** Live session controls for the perform header ⋮ menu. */
export function LiveMenu({ live }: { live: LiveSession }) {
  const { t } = useTranslation();

  return (
    <div className="w-72 border-b border-border px-4 pt-2 pb-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
        {t("live.title")}
      </div>
      <div className="flex flex-wrap gap-2">
        {LIVE_MODE_VALUES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={live.mode === mode}
            onClick={() => live.setMode(mode)}
            className={choiceClass(live.mode === mode)}
          >
            {t(`live.mode.${mode}`)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-muted">{t(`live.hint.${live.mode}`)}</p>
    </div>
  );
}

/** Header reminder that this device leads or follows, and whether it is connected. */
export function LiveChip({ live, onClick }: { live: LiveSession; onClick: () => void }) {
  const { t } = useTranslation();
  if (live.mode === LIVE_MODE.off) return null;
  const connected = live.state === LIVE_STATE.open;
  const label = `${t(`live.chip.${live.mode}`)}${connected ? "" : ` · ${t("live.offline")}`}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded-md border px-2 py-1 text-sm font-medium ${
        connected ? "border-accent text-accent" : "border-border text-text-faint"
      }`}
    >
      {t(`live.chip.${live.mode}`)}
    </button>
  );
}
