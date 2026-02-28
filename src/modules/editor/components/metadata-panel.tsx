import { MAJOR_KEYS, MINOR_KEYS } from "@domain/music";
import type { SongDisplayPrefs } from "@domain/preferences";
import type { SongFormValues } from "@domain/schemas/song";
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Field, Input, Select, Textarea } from "../../design-system/components/form";

interface MetadataPanelProps {
  register: UseFormRegister<SongFormValues>;
  errors: FieldErrors<SongFormValues>;
  watch: UseFormWatch<SongFormValues>;
  setValue: UseFormSetValue<SongFormValues>;
  tags: string[];
  tagInput: string;
  onTagInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  isNew: boolean;
  songId?: string;
  // Panel collapse (desktop drawer only)
  onTogglePanel?: () => void;
  // Display overrides
  overrides: Partial<SongDisplayPrefs>;
  overridesOpen: boolean;
  onOverridesOpenChange: (open: boolean) => void;
  globalPrefs: SongDisplayPrefs;
  onUpdateOverride: (patch: Partial<SongDisplayPrefs>) => void;
  onClearOverrideKey: (key: keyof SongDisplayPrefs) => void;
  onClearAllOverrides: () => void;
}

export function MetadataPanel({
  register,
  errors,
  tags,
  tagInput,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  isNew,
  onTogglePanel,
  overrides,
  overridesOpen,
  onOverridesOpenChange,
  globalPrefs,
  onUpdateOverride,
  onClearOverrideKey,
  onClearAllOverrides,
}: MetadataPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {onTogglePanel && (
        <button
          type="button"
          onClick={onTogglePanel}
          className="btn btn-ghost btn-sm self-end"
          aria-label={t("editor.toggleMetadata")}
          title={t("editor.toggleMetadata")}
        >
          ▸
        </button>
      )}

      {/* Title */}
      <Field label={t("editor.titleLabel")} error={errors.title?.message}>
        <Input {...register("title")} placeholder={t("editor.titlePlaceholder")} />
      </Field>

      {/* Artist */}
      <Field label={t("editor.artistLabel")} error={errors.artist?.message}>
        <Input {...register("artist")} placeholder={t("editor.artistPlaceholder")} />
      </Field>

      {/* Key / BPM / Duration / Transposition — 2x2 grid for narrow panel */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("editor.keyLabel")} error={errors.key?.message}>
          <Select {...register("key", { setValueAs: (v: string) => v || undefined })}>
            <option value="">—</option>
            <optgroup label={t("editor.majorGroup")}>
              {MAJOR_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("editor.minorGroup")}>
              {MINOR_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>

        <Field label={t("editor.bpmLabel")} error={errors.bpm?.message}>
          <Input
            type="number"
            {...register("bpm", {
              setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
            })}
            placeholder="120"
          />
        </Field>

        <Field label={t("editor.durationLabel")} error={errors.duration?.message}>
          <Input
            type="number"
            {...register("duration", {
              setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
            })}
            placeholder="240"
          />
        </Field>

        <Field label={t("editor.transpositionLabel")} error={errors.transposition?.message}>
          <Input
            type="number"
            {...register("transposition", {
              setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
            })}
            placeholder="0"
          />
        </Field>
      </div>

      {/* Tags */}
      <Field label={t("editor.tagsLabel")}>
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-sm bg-bg-raised px-2 py-0.5 text-sm text-text-muted"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                aria-label={`Remove ${tag}`}
                className="ml-0.5 text-text-faint hover:text-danger"
              >
                x
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            value={tagInput}
            onChange={(e) => onTagInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddTag();
              }
            }}
            placeholder={t("editor.addTagPlaceholder")}
            className="flex-1"
          />
          <button type="button" onClick={onAddTag} className="btn btn-ghost">
            {t("common.add")}
          </button>
        </div>
      </Field>

      {/* Notes */}
      <Field label={t("editor.notesLabel")} error={errors.notes?.message}>
        <Textarea
          {...register("notes")}
          placeholder={t("editor.notesPlaceholder")}
          rows={2}
          className="resize-y"
        />
      </Field>

      {/* Tech Notes */}
      <Field label={t("editor.techNotesLabel")} error={errors.techNotes?.message}>
        <Textarea
          {...register("techNotes")}
          placeholder={t("editor.techNotesPlaceholder")}
          rows={2}
          className="resize-y"
        />
      </Field>

      {/* Links */}
      <details className="group rounded-md border border-border">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-text-muted">
          {t("editor.linksLabel")}
        </summary>
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          <Field label="YouTube">
            <Input {...register("links.youtube")} placeholder="https://youtube.com/watch?v=..." />
          </Field>
          <Field label="Spotify">
            <Input
              {...register("links.spotify")}
              placeholder="https://open.spotify.com/track/..."
            />
          </Field>
          <Field label="Deezer">
            <Input {...register("links.deezer")} placeholder="https://deezer.com/track/..." />
          </Field>
        </div>
      </details>

      {/* Display Overrides (existing songs only) */}
      {!isNew && (
        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-text-muted">
            {t("editor.displayOverrides")}
          </legend>

          <label className="mb-2 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={overridesOpen}
              onChange={(e) => {
                if (!e.target.checked) onClearAllOverrides();
                else onOverridesOpenChange(true);
              }}
              className="h-4 w-4 rounded accent-[var(--color-accent)]"
            />
            <span className="text-sm text-text">{t("editor.enableDisplayOverrides")}</span>
          </label>

          <p className="mb-3 text-xs text-text-faint">{t("editor.displayOverridesDesc")}</p>

          {overridesOpen && (
            <div className="flex flex-col gap-4">
              <OverrideSizeField
                label={t("settings.display.scale")}
                field="globalScale"
                min={0.5}
                max={3}
                step={0.1}
                suffix="x"
                globalValue={globalPrefs.globalScale}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
              <OverrideSizeField
                label={t("settings.sizes.lyrics")}
                field="lyricsSize"
                min={0.5}
                max={4}
                step={0.125}
                suffix="rem"
                globalValue={globalPrefs.lyricsSize}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
              <OverrideSizeField
                label={t("settings.sizes.chords")}
                field="chordSize"
                min={0.5}
                max={4}
                step={0.125}
                suffix="rem"
                globalValue={globalPrefs.chordSize}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
              <OverrideSizeField
                label={t("settings.sizes.sectionLabels")}
                field="sectionSize"
                min={0.5}
                max={4}
                step={0.125}
                suffix="rem"
                globalValue={globalPrefs.sectionSize}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
              <OverrideColorField
                label={t("settings.colors.chords")}
                field="chordColor"
                globalValue={globalPrefs.chordColor}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
              <OverrideColorField
                label={t("settings.colors.verse")}
                field="verseColor"
                globalValue={globalPrefs.verseColor}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
              <OverrideColorField
                label={t("settings.colors.chorus")}
                field="chorusColor"
                globalValue={globalPrefs.chorusColor}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
              <OverrideColorField
                label={t("settings.colors.bridge")}
                field="bridgeColor"
                globalValue={globalPrefs.bridgeColor}
                overrides={overrides}
                onUpdate={onUpdateOverride}
                onClear={onClearOverrideKey}
              />
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override field components
// ---------------------------------------------------------------------------

type SizeKey = "globalScale" | "lyricsSize" | "chordSize" | "sectionSize";

function OverrideSizeField({
  label,
  field,
  min,
  max,
  step,
  suffix,
  globalValue,
  overrides,
  onUpdate,
  onClear,
}: {
  label: string;
  field: SizeKey;
  min: number;
  max: number;
  step: number;
  suffix: string;
  globalValue: number;
  overrides: Partial<SongDisplayPrefs>;
  onUpdate: (patch: Partial<SongDisplayPrefs>) => void;
  onClear: (key: keyof SongDisplayPrefs) => void;
}) {
  const active = overrides[field] !== undefined;
  const value = overrides[field] ?? globalValue;

  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-text">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onUpdate({ [field]: Number(e.target.value) })}
        className="flex-1"
      />
      <span className="w-16 text-right text-sm text-text-muted">
        {value}
        {suffix}
      </span>
      {active && (
        <button
          type="button"
          onClick={() => onClear(field)}
          className="text-xs text-text-faint hover:text-danger"
          title="Reset to global"
        >
          ✕
        </button>
      )}
    </label>
  );
}

type ColorKey = "chordColor" | "verseColor" | "chorusColor" | "bridgeColor";

function OverrideColorField({
  label,
  field,
  globalValue,
  overrides,
  onUpdate,
  onClear,
}: {
  label: string;
  field: ColorKey;
  globalValue: string;
  overrides: Partial<SongDisplayPrefs>;
  onUpdate: (patch: Partial<SongDisplayPrefs>) => void;
  onClear: (key: keyof SongDisplayPrefs) => void;
}) {
  const active = overrides[field] !== undefined;
  const value = overrides[field] ?? globalValue;

  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-text">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onUpdate({ [field]: e.target.value })}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onUpdate({ [field]: v });
        }}
        className="field w-24"
        maxLength={7}
      />
      {active && (
        <button
          type="button"
          onClick={() => onClear(field)}
          className="text-xs text-text-faint hover:text-danger"
          title="Reset to global"
        >
          ✕
        </button>
      )}
    </label>
  );
}
