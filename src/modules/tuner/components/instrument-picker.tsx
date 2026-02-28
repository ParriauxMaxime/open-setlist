import { useTranslation } from "react-i18next";
import { TUNINGS } from "../../../domain/tunings";

interface InstrumentPickerProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function InstrumentPicker({ selectedId, onSelect }: InstrumentPickerProps) {
  const { t } = useTranslation();

  const options: { id: string | null; label: string }[] = [
    { id: null, label: t("tuner.instruments.none") },
    ...TUNINGS.map((tuning) => ({
      id: tuning.id,
      label: t(`tuner.instruments.${tuning.nameKey}`),
    })),
  ];

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {options.map((option) => (
        <button
          key={option.id ?? "chromatic"}
          type="button"
          onClick={() => onSelect(option.id)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            selectedId === option.id
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-surface)] text-text-muted hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
