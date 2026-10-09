import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Tempo, useBeat } from "../hooks/use-tempo";

const LONG_PRESS_MS = 500;

const MENU_ITEM =
  "flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-base text-text hover:bg-bg-hover";

/** BPM chip: tap toggles the beat pulse, long-press (or right-click) opens count-in and click sound. */
export function TempoChip({ tempo }: { tempo: Tempo }) {
  const { t } = useTranslation();
  const beat = useBeat(tempo.beats);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The click that ends a long-press must not also toggle the pulse
  const longPressed = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  if (tempo.bpm === undefined) return null;

  const startPress = () => {
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  const handleClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    tempo.toggle();
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    cancelPress();
    setMenuOpen(true);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={handleContextMenu}
        className={`relative inline-flex h-11 touch-manipulation items-center gap-1 overflow-hidden rounded-md px-2 text-sm font-medium tabular-nums [-webkit-touch-callout:none] active:bg-bg-hover ${
          tempo.active ? "text-accent" : "text-text-muted"
        }`}
        aria-label={t("performTempo.chipLabel", { bpm: tempo.bpm })}
        aria-pressed={tempo.active}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={t("performTempo.chipHint")}
      >
        {beat && (
          <span
            key={beat.index}
            aria-hidden="true"
            className="tempo-flash pointer-events-none absolute inset-0 bg-accent-muted"
            data-accent={beat.accent}
          />
        )}
        <span aria-hidden="true" className="relative">
          ♩
        </span>
        <span className="relative">{tempo.bpm}</span>
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-52 rounded-md border border-border bg-bg-surface py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              tempo.countIn();
              setMenuOpen(false);
            }}
            className={MENU_ITEM}
          >
            {t("performTempo.countIn", { count: tempo.beatsPerBar })}
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={tempo.active}
            onClick={() => {
              tempo.toggle();
              setMenuOpen(false);
            }}
            className={MENU_ITEM}
          >
            {t("performTempo.pulse")}
            <span aria-hidden="true" className="text-accent">
              {tempo.active ? "✓" : ""}
            </span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={tempo.audioEnabled}
            onClick={tempo.toggleAudio}
            className={MENU_ITEM}
          >
            {t("performTempo.clickSound")}
            <span aria-hidden="true" className="text-accent">
              {tempo.audioEnabled ? "✓" : ""}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
