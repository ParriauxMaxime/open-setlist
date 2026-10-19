import { useTranslation } from "react-i18next";
import { TUNINGS } from "../../../domain/tunings";
import { Choice } from "../../design-system/components/card";

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
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Choice
          key={option.id ?? "chromatic"}
          selected={selectedId === option.id}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </Choice>
      ))}
    </div>
  );
}
