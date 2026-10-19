import { NOTATION_LIST } from "@domain/chords/notation";
import { INSTRUMENT_VALUES } from "@domain/chords/types";
import { ACCENT_PRESETS, type AppPreferences } from "@domain/preferences";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { Select } from "../../design-system/components/form";
import { Choice, SettingRow, SettingsGroup, ToggleRow } from "./setting-row";

const SCHEME_KEYS: Record<string, string> = {
  light: "settings.scheme.light",
  dark: "settings.scheme.dark",
  system: "settings.scheme.system",
};

const ACCENT_KEYS: Record<string, string> = {
  Blue: "settings.accent.blue",
  Purple: "settings.accent.purple",
  Green: "settings.accent.green",
  Orange: "settings.accent.orange",
  Pink: "settings.accent.pink",
};

interface PreferencesSectionProps {
  prefs: AppPreferences;
  update: (patch: Partial<AppPreferences>) => void;
}

/** Language, notation, instrument and the look of the app itself. */
export function PreferencesSection({ prefs, update }: PreferencesSectionProps) {
  const { t } = useTranslation();
  const matchedAccent = ACCENT_PRESETS.find((p) => p.color === prefs.accentColor);

  return (
    <>
      <SettingsGroup>
        <SettingRow label={t("settings.preferences.language")}>
          {(["en", "fr"] as const).map((loc) => (
            <Choice
              key={loc}
              selected={prefs.locale === loc}
              onClick={() => {
                update({ locale: loc });
                i18n.changeLanguage(loc);
              }}
            >
              {loc === "en" ? "English" : "Français"}
            </Choice>
          ))}
        </SettingRow>

        <SettingRow label={t("notation.label")} description={t("notation.desc")}>
          <Select
            value={prefs.notation}
            onChange={(e) => {
              const notation = NOTATION_LIST.find((n) => n === e.target.value);
              if (notation) update({ notation });
            }}
            aria-label={t("notation.label")}
          >
            {NOTATION_LIST.map((n) => (
              <option key={n} value={n}>
                {t(`notation.${n}`)}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow label={t("settings.instrument.label")}>
          {INSTRUMENT_VALUES.map((inst) => (
            <Choice
              key={inst}
              selected={prefs.favoriteInstrument === inst}
              onClick={() => update({ favoriteInstrument: inst })}
            >
              {t(`settings.instrument.${inst}`)}
            </Choice>
          ))}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.appearance.heading")}>
        <SettingRow label={t("settings.scheme.label")}>
          {(["light", "dark", "system"] as const).map((scheme) => (
            <Choice
              key={scheme}
              selected={prefs.colorScheme === scheme}
              onClick={() => update({ colorScheme: scheme })}
            >
              {t(SCHEME_KEYS[scheme])}
            </Choice>
          ))}
        </SettingRow>

        <SettingRow label={t("settings.accent.label")} stacked>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((preset) => (
              <Choice
                key={preset.name}
                selected={prefs.accentColor === preset.color}
                title={t(ACCENT_KEYS[preset.name] ?? preset.name)}
                onClick={() => update({ accentColor: preset.color })}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: preset.color }}
                />
                {t(ACCENT_KEYS[preset.name] ?? preset.name)}
              </Choice>
            ))}
            <label
              className={[
                "flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                matchedAccent
                  ? "border-border text-text-muted hover:border-text-faint hover:text-text"
                  : "border-accent bg-accent-muted text-accent",
              ].join(" ")}
            >
              <input
                type="color"
                value={prefs.accentColor}
                onChange={(e) => update({ accentColor: e.target.value })}
                className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              {t("common.custom")}
            </label>
          </div>
        </SettingRow>

        <ToggleRow
          label={t("settings.scheme.forceDark")}
          description={t("settings.scheme.forceDarkDesc")}
          checked={prefs.performForceDark}
          onChange={(performForceDark) => update({ performForceDark })}
        />
      </SettingsGroup>
    </>
  );
}
