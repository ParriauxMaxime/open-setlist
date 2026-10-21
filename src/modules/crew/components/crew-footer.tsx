import { estimatedEnd, remainingSeconds, unknownRemaining } from "@domain/crew-timing";
import { useTranslation } from "react-i18next";
import type { CrewClock } from "../hooks/use-crew-clock";

interface CrewFooterProps {
  title: string | undefined;
  durations: readonly (number | undefined)[];
  currentIndex: number;
  clock: CrewClock;
}

/** "Now · Song" and the countdown to the last song's end. */
export function CrewFooter({ title, durations, currentIndex, clock }: CrewFooterProps) {
  const { t, i18n } = useTranslation();
  const remaining = remainingSeconds({
    durations,
    currentIndex,
    elapsedSeconds: (clock.now - clock.startedAt) / 1000,
  });
  const unknown = unknownRemaining(durations, currentIndex);
  const ends = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(estimatedEnd(clock.now, remaining));

  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-bg px-4 py-3 text-sm">
      <span className="min-w-0 truncate text-text">{title && t("crew.now", { title })}</span>
      <span className="shrink-0 text-right tabular-nums text-text-muted">
        {t("crew.remaining", { minutes: Math.ceil(remaining / 60), time: ends })}
        {unknown > 0 && <> · {t("crew.unknownLength", { count: unknown })}</>}
      </span>
    </footer>
  );
}
