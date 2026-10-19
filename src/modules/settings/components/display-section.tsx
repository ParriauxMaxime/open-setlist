import {
  type AppPreferences,
  COLOR_THEMES,
  type ColorTheme,
  DEFAULT_PREFERENCES,
  exportPreferences,
  importPreferences,
  matchThemeName,
  saveSongOverrides,
} from "@domain/preferences";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Choice, SettingRow, SettingsGroup, ToggleRow } from "./setting-row";

const THEME_NAME_KEYS: Record<string, string> = {
  "High Contrast": "settings.theme.highContrast",
  Paper: "settings.theme.paper",
};

type Status =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

interface DisplaySectionProps {
  prefs: AppPreferences;
  update: (patch: Partial<AppPreferences>) => void;
  replace: (next: AppPreferences) => void;
}

/** How a song looks on stage: sizes, colors, and the backup of those choices. */
export function DisplaySection({ prefs, update, replace }: DisplaySectionProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const activeTheme = matchThemeName(prefs);

  const applyTheme = (theme: ColorTheme) =>
    update({
      chordColor: theme.chordColor,
      verseColor: theme.verseColor,
      chorusColor: theme.chorusColor,
      bridgeColor: theme.bridgeColor,
    });

  const handleExport = () => {
    exportPreferences(prefs);
    setStatus({ type: "success", message: t("settings.preferences.exported") });
  };

  const handleImport = async () => {
    try {
      const result = await importPreferences();
      replace(result.preferences);
      if (result.songOverrides) saveSongOverrides(result.songOverrides);
      setStatus({ type: "success", message: t("settings.preferences.imported") });
    } catch (err) {
      if (err instanceof DOMException) return;
      const message = err instanceof Error ? err.message : t("sync.importFailed");
      setStatus({ type: "error", message });
    }
  };

  const handleReset = () => {
    replace({ ...DEFAULT_PREFERENCES });
    saveSongOverrides({});
    setStatus({ type: "success", message: t("settings.preferences.reset") });
  };

  return (
    <>
      <SettingsGroup title={t("settings.sizes.heading")}>
        <SliderRow
          label={t("settings.display.scale")}
          description={t("settings.display.scaleDesc")}
          value={prefs.globalScale}
          unit="x"
          min={0.5}
          max={3}
          step={0.1}
          onChange={(globalScale) => update({ globalScale })}
        />
        <SliderRow
          label={t("settings.sizes.lyrics")}
          value={prefs.lyricsSize}
          onChange={(lyricsSize) => update({ lyricsSize })}
        />
        <SliderRow
          label={t("settings.sizes.chords")}
          value={prefs.chordSize}
          onChange={(chordSize) => update({ chordSize })}
        />
        <SliderRow
          label={t("settings.sizes.sectionLabels")}
          value={prefs.sectionSize}
          onChange={(sectionSize) => update({ sectionSize })}
        />
        <ToggleRow
          label={t("settings.scheme.doubleTapScale")}
          description={t("settings.scheme.doubleTapScaleDesc")}
          checked={prefs.performDoubleTapScale}
          onChange={(performDoubleTapScale) => update({ performDoubleTapScale })}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.colors.heading")}>
        <SettingRow label={t("settings.theme.heading")} stacked>
          <div className="flex flex-wrap gap-2">
            {COLOR_THEMES.map((theme) => (
              <Choice
                key={theme.name}
                selected={activeTheme === theme.name}
                onClick={() => applyTheme(theme)}
              >
                <ThemeSwatches theme={theme} />
                {t(THEME_NAME_KEYS[theme.name] ?? theme.name)}
              </Choice>
            ))}
            {!activeTheme && (
              <span className="flex items-center rounded-md border border-accent bg-accent-muted px-3 py-1.5 text-sm text-accent">
                {t("common.custom")}
              </span>
            )}
          </div>
        </SettingRow>
        <ColorRow
          label={t("settings.colors.chords")}
          value={prefs.chordColor}
          onChange={(chordColor) => update({ chordColor })}
        />
        <ColorRow
          label={t("settings.colors.verse")}
          value={prefs.verseColor}
          onChange={(verseColor) => update({ verseColor })}
        />
        <ColorRow
          label={t("settings.colors.chorus")}
          value={prefs.chorusColor}
          onChange={(chorusColor) => update({ chorusColor })}
        />
        <ColorRow
          label={t("settings.colors.bridge")}
          value={prefs.bridgeColor}
          onChange={(bridgeColor) => update({ bridgeColor })}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.backup.heading")}>
        <SettingRow label={t("settings.backup.file")} description={t("settings.backup.fileDesc")}>
          <button type="button" onClick={handleExport} className="btn btn-outline btn-sm">
            {t("common.export")}
          </button>
          <button type="button" onClick={handleImport} className="btn btn-ghost btn-sm">
            {t("common.import")}
          </button>
        </SettingRow>
        <SettingRow label={t("settings.preferences.resetToDefaults")}>
          <button type="button" onClick={handleReset} className="btn btn-ghost btn-sm">
            {t("settings.backup.reset")}
          </button>
        </SettingRow>
      </SettingsGroup>

      <div aria-live="polite">
        {status.type === "success" && <p className="text-sm text-accent">{status.message}</p>}
        {status.type === "error" && <p className="text-sm text-danger">{status.message}</p>}
      </div>
    </>
  );
}

const SWATCH_KEYS = ["chord", "verse", "chorus", "bridge"] as const;

function ThemeSwatches({ theme }: { theme: ColorTheme }) {
  const colors = [theme.chordColor, theme.verseColor, theme.chorusColor, theme.bridgeColor];
  return (
    <span className="flex gap-0.5">
      {SWATCH_KEYS.map((key, i) => (
        <span
          key={key}
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: colors[i] }}
        />
      ))}
    </span>
  );
}

interface SliderRowProps {
  label: string;
  description?: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

function SliderRow({
  label,
  description,
  value,
  unit = "rem",
  min = 0.5,
  max = 4,
  step = 0.125,
  onChange,
}: SliderRowProps) {
  return (
    <SettingRow label={label} description={description} stacked>
      <label className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
          aria-label={label}
        />
        <span className="w-16 text-right text-sm tabular-nums text-text-muted">
          {value}
          {unit}
        </span>
      </label>
    </SettingRow>
  );
}

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <SettingRow label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
          }}
          className="field-sm w-24 font-mono"
          maxLength={7}
          aria-label={label}
        />
      </div>
    </SettingRow>
  );
}
