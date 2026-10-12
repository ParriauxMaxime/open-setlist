import { formatDuration, parseDuration } from "@domain/format";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Input } from "../../design-system/components/form";

interface DurationFieldProps {
  /** Seconds. */
  value: number | undefined;
  onChange: (seconds: number | undefined) => void;
}

/** Song length typed as `3:45`; read when the field is left. */
export function DurationField({ value, onChange }: DurationFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value ? formatDuration(value) : "");
  const [invalid, setInvalid] = useState(false);

  // The chart's {duration} directive can change the value from outside
  useEffect(() => {
    setText(value ? formatDuration(value) : "");
    setInvalid(false);
  }, [value]);

  return (
    <Field label={t("editor.durationLabel")} error={invalid ? "editor.durationInvalid" : undefined}>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const seconds = parseDuration(text);
          setInvalid(seconds === null);
          if (seconds === null) return;
          if (seconds !== value) onChange(seconds);
          else setText(seconds ? formatDuration(seconds) : "");
        }}
        inputMode="numeric"
        placeholder="3:45"
      />
    </Field>
  );
}
