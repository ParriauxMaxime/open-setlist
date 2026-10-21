import { extractPatchCode, MIDI_ENCODING, parsePatchCode, patchMessages } from "@domain/midi/patch";
import { DEFAULT_MIDI_SETTINGS, patchEncoding } from "@domain/midi/settings";
import { PART, PART_VALUES } from "@domain/parts";
import { useTranslation } from "react-i18next";
import { Field, Input, Select } from "../../design-system/components/form";
import { partLabel } from "../../performance/components/my-part-menu";
import { MidiNotePicker } from "../../shared/components/midi-note-picker";
import { useMidiSettings } from "../../shared/hooks/use-midi-settings";

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

  const settings = useMidiSettings();

  const encodingOf = (part: string) =>
    patchEncoding(part === settings.role ? settings : { ...DEFAULT_MIDI_SETTINGS, role: part });
  const error = (part: string): string | undefined => {
    const parsed = parsePatchCode(patches[part]);
    const encoding = encodingOf(part);
    if (patches[part].trim() === "" || (parsed && patchMessages(parsed, encoding))) return;
    if (encoding.encoding === MIDI_ENCODING.note) return "midi.errors.badNote";
    return encoding.encoding === MIDI_ENCODING.controlChange
      ? "midi.errors.badCc"
      : "midi.errors.badCode";
  };
  const firstError = used.map(error).find(Boolean);
  const sendsNotes = (part: string) => encodingOf(part).encoding === MIDI_ENCODING.note;

  const set = (part: string, code: string) => onChange({ ...patches, [part]: code });
  const remove = (part: string) => {
    const next = { ...patches };
    delete next[part];
    onChange(next);
  };

  return (
    <Field label={t("midi.patches.label")} error={firstError}>
      <div className="flex flex-col gap-1.5">
        {chartCode && (
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
            {sendsNotes(part) ? (
              <MidiNotePicker
                value={patches[part]}
                onChange={(code) => set(part, code)}
                aria-label={t("midi.patches.code", { part: partLabel(part, t, false) })}
                aria-invalid={Boolean(error(part))}
              />
            ) : (
              <Input
                value={patches[part]}
                onChange={(e) => set(part, e.target.value)}
                placeholder="12"
                aria-label={t("midi.patches.code", { part: partLabel(part, t, false) })}
                aria-invalid={Boolean(error(part))}
                className="max-w-24"
              />
            )}
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
