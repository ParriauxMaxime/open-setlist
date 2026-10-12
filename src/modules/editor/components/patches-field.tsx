import { extractPatchCode, parsePatchCode } from "@domain/midi/patch";
import { PART, PART_VALUES } from "@domain/parts";
import { useTranslation } from "react-i18next";
import { Field, Input, Select } from "../../design-system/components/form";
import { partLabel } from "../../performance/components/my-part-menu";

interface PatchesFieldProps {
  patches: Record<string, string>;
  /** The chart's setup line, where the band writes the keyboard's code. */
  setupLine: string | undefined;
  onChange: (patches: Record<string, string>) => void;
}

/** One sound code per instrument, sent as MIDI when the song comes up on stage. */
export function PatchesField({ patches, setupLine, onChange }: PatchesFieldProps) {
  const { t } = useTranslation();
  const chartCode = setupLine ? extractPatchCode(setupLine) : undefined;
  const used = Object.keys(patches);
  const free = PART_VALUES.filter((part) => !used.includes(part));

  const set = (part: string, code: string) => onChange({ ...patches, [part]: code });
  const remove = (part: string) => {
    const next = { ...patches };
    delete next[part];
    onChange(next);
  };

  return (
    <Field label={t("midi.patches.label")}>
      <div className="flex flex-col gap-1.5">
        {chartCode && !patches[PART.keys] && (
          <p className="text-sm text-text-muted">
            {partLabel(PART.keys, t, false)} : <span className="text-chord">{chartCode}</span>{" "}
            <span className="text-text-faint">({t("midi.patches.fromChart")})</span>
          </p>
        )}
        {used.map((part) => (
          <div key={part} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-sm text-text-muted">
              {partLabel(part, t, false)}
            </span>
            <Input
              value={patches[part]}
              onChange={(e) => set(part, e.target.value)}
              placeholder="12"
              aria-label={t("midi.patches.code", { part: partLabel(part, t, false) })}
              aria-invalid={patches[part] !== "" && !parsePatchCode(patches[part])}
              className="max-w-24"
            />
            <button
              type="button"
              onClick={() => remove(part)}
              aria-label={t("midi.patches.remove", { part: partLabel(part, t, false) })}
              className="text-text-faint hover:text-danger"
            >
              ✕
            </button>
          </div>
        ))}
        {free.length > 0 && (
          <Select
            value=""
            onChange={(e) => e.target.value && set(e.target.value, "")}
            aria-label={t("midi.patches.add")}
          >
            <option value="">{t("midi.patches.add")}</option>
            {free.map((part) => (
              <option key={part} value={part}>
                {partLabel(part, t, false)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="text-xs text-text-faint">{t("midi.patches.hint")}</p>
    </Field>
  );
}
