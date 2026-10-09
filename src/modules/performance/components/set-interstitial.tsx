import { isSetBreak, setLabel } from "@domain/perform-tempo";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FlatEntry } from "../hooks/use-setlist-navigation";

const VISIBLE_MS = 1800;

/** Briefly shows the set name when navigation crosses into another set. Never blocks input. */
export function SetInterstitial({ current }: { current: FlatEntry | undefined }) {
  const { t } = useTranslation();
  const previous = useRef(current);
  const [shown, setShown] = useState<{ label: string; id: number } | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = current;
    if (!isSetBreak(from, current)) return;
    setShown({
      label: setLabel(current, (setNumber) => t("performTempo.setNumber", { number: setNumber })),
      id: Date.now(),
    });
  }, [current, t]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-1/4 z-20 flex justify-center px-4"
    >
      <span
        key={shown.id}
        className="set-interstitial truncate rounded-lg border border-border bg-bg-surface/90 px-8 py-4 text-3xl font-bold text-accent shadow-lg"
      >
        {shown.label}
      </span>
    </div>
  );
}
