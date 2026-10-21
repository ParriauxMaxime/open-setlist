import { useTranslation } from "react-i18next";

interface TransposeControlProps {
  transposition: number;
  onTranspose: (delta: number) => void;
}

/** Transpose − n +, in semitones. */
export function TransposeControl({ transposition, onTranspose }: TransposeControlProps) {
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        onClick={() => onTranspose(-1)}
        className="perform-btn"
        aria-label={t("perform.transposeDown")}
      >
        −
      </button>
      <span className="min-w-[2ch] text-center text-sm font-medium text-text-muted tabular-nums">
        {transposition > 0 ? `+${transposition}` : transposition}
      </span>
      <button
        type="button"
        onClick={() => onTranspose(1)}
        className="perform-btn"
        aria-label={t("perform.transposeUp")}
      >
        +
      </button>
    </>
  );
}

interface ScrollSpeedControlProps {
  speed: number | null;
  /** True when the speed is derived from duration rather than stored on the song. */
  derived: boolean;
  onChange: (delta: number) => void;
}

/** Auto-scroll speed − n +, in the bar on wider screens, in the tools drawer on phones. */
export function ScrollSpeedControl({ speed, derived, onChange }: ScrollSpeedControlProps) {
  const { t } = useTranslation();
  const shown = speed === null ? "–" : Math.round(speed);

  return (
    <>
      <button
        type="button"
        onClick={() => onChange(-1)}
        className="perform-btn"
        aria-label={t("performStage.scrollSlower")}
      >
        −
      </button>
      <output
        className={`flex min-w-[2ch] flex-col items-center text-sm font-medium tabular-nums leading-tight ${
          derived ? "text-text-faint" : "text-text-muted"
        }`}
        title={derived ? t("performStage.scrollSpeedAuto") : t("performStage.scrollSpeedLabel")}
        aria-label={t(
          derived ? "performStage.scrollSpeedValueAuto" : "performStage.scrollSpeedValue",
          { speed: shown },
        )}
      >
        {shown}
        <span aria-hidden="true" className="hidden text-xs font-normal md:block">
          {t("performStage.scrollShort")}
        </span>
      </output>
      <button
        type="button"
        onClick={() => onChange(1)}
        className="perform-btn"
        aria-label={t("performStage.scrollFaster")}
      >
        +
      </button>
    </>
  );
}
