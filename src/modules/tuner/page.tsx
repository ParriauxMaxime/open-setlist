import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TUNINGS } from "../../domain/tunings";
import { InstrumentPicker } from "./components/instrument-picker";
import { StringVisualization } from "./components/string-visualization";
import { TunerGauge } from "./components/tuner-gauge";
import { useActiveString } from "./hooks/use-active-string";
import { usePitch } from "./hooks/use-pitch";

export function TunerPage() {
  const { t } = useTranslation();
  const { note, frequency, cents, listening, error, start, stop } = usePitch();

  useEffect(() => {
    start();
  }, [start]);
  const [selectedTuningId, setSelectedTuningId] = useState<string | null>("guitar-standard");

  const selectedTuning = selectedTuningId
    ? (TUNINGS.find((t) => t.id === selectedTuningId) ?? null)
    : null;

  const activeString = useActiveString(note, cents, selectedTuning);

  const centsColor =
    cents != null
      ? Math.abs(cents) < 5
        ? "text-[var(--color-success)]"
        : Math.abs(cents) < 15
          ? "text-[var(--color-warning)]"
          : "text-[var(--color-danger)]"
      : "text-text-muted";

  return (
    <div className="p-page">
      <h1 className="mb-6 text-2xl font-bold">{t("tuner.title")}</h1>

      {error && (
        <div className="mb-4 rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]">
          {t(`tuner.${error}`)}
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        <TunerGauge cents={listening ? cents : null} />

        <div className="text-6xl font-bold tabular-nums">{note ?? "--"}</div>

        <div className="text-lg text-text-muted">
          {frequency != null ? `${frequency.toFixed(1)} ${t("tuner.hz")}` : `-- ${t("tuner.hz")}`}
        </div>

        <div className={`text-sm ${centsColor}`}>
          {cents != null
            ? `${cents > 0 ? "+" : ""}${cents} ${t("tuner.cents")}`
            : `-- ${t("tuner.cents")}`}
        </div>

        <button
          type="button"
          onClick={listening ? stop : start}
          className={listening ? "btn btn-outline" : "btn btn-primary"}
        >
          {listening ? t("tuner.stop") : t("tuner.start")}
        </button>

        <InstrumentPicker selectedId={selectedTuningId} onSelect={setSelectedTuningId} />

        {selectedTuning && (
          <StringVisualization tuning={selectedTuning} activeString={activeString} />
        )}
      </div>
    </div>
  );
}
