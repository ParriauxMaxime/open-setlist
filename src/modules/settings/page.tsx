import {
  ACCENT_PRESETS,
  type AppPreferences,
  applyPreferences,
  COLOR_THEMES,
  type ColorTheme,
  DEFAULT_PREFERENCES,
  exportPreferences,
  importPreferences,
  loadPreferences,
  matchThemeName,
  savePreferences,
  saveSongOverrides,
} from "@domain/preferences";
import { useActiveProfileId } from "@domain/profiles";
import { detectPlatform, requestPwaPrompt } from "@domain/pwa";
import i18n from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitHubConfigForm } from "./components/github-config-form";
import { GoogleDriveConfigForm } from "./components/google-drive-config-form";
import { ProfileManager } from "./components/profile-manager";

export const SETTINGS_SCROLL_KEY = "settings-scroll-to";

type Status =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

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

const INSTRUMENT_KEYS: Record<string, string> = {
  guitar: "settings.instrument.guitar",
  piano: "settings.instrument.piano",
};

const THEME_NAME_KEYS: Record<string, string> = {
  "High Contrast": "settings.theme.highContrast",
  Paper: "settings.theme.paper",
};

export function SettingsPage() {
  const { t } = useTranslation();
  const profileId = useActiveProfileId();
  const [prefs, setPrefs] = useState(loadPreferences);
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const update = useCallback((patch: Partial<AppPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      applyPreferences(next);
      return next;
    });
  }, []);

  const applyTheme = useCallback(
    (theme: ColorTheme) => {
      update({
        chordColor: theme.chordColor,
        verseColor: theme.verseColor,
        chorusColor: theme.chorusColor,
        bridgeColor: theme.bridgeColor,
      });
    },
    [update],
  );

  const handleLocaleChange = useCallback(
    (loc: "en" | "fr") => {
      update({ locale: loc });
      i18n.changeLanguage(loc);
    },
    [update],
  );

  const handleExport = useCallback(() => {
    exportPreferences(prefs);
    setStatus({ type: "success", message: t("settings.preferences.exported") });
  }, [prefs, t]);

  const handleImport = useCallback(async () => {
    try {
      const result = await importPreferences();
      savePreferences(result.preferences);
      applyPreferences(result.preferences);
      if (result.songOverrides) saveSongOverrides(result.songOverrides);
      setPrefs(result.preferences);
      setStatus({ type: "success", message: t("settings.preferences.imported") });
    } catch (err) {
      if (err instanceof DOMException) {
        return;
      }
      const message = err instanceof Error ? err.message : t("sync.importFailed");
      setStatus({ type: "error", message });
    }
  }, [t]);

  const handleReset = useCallback(() => {
    const defaults = { ...DEFAULT_PREFERENCES };
    savePreferences(defaults);
    applyPreferences(defaults);
    saveSongOverrides({});
    setPrefs(defaults);
    setStatus({ type: "success", message: t("settings.preferences.reset") });
  }, [t]);

  const [scrollTarget] = useState(() => {
    const value = sessionStorage.getItem(SETTINGS_SCROLL_KEY);
    if (value) sessionStorage.removeItem(SETTINGS_SCROLL_KEY);
    return value;
  });

  useEffect(() => {
    if (scrollTarget) {
      document.getElementById(scrollTarget)?.scrollIntoView({ behavior: "smooth" });
    }
  }, [scrollTarget]);

  const activeTheme = matchThemeName(prefs);
  const matchedAccent = ACCENT_PRESETS.find((p) => p.color === prefs.accentColor);

  return (
    <div className="p-page">
      <h1 className="mb-4 text-2xl font-bold">{t("settings.title")}</h1>

      <p className="mb-6 text-text-muted">{t("settings.autoSaveNote")}</p>

      {/* ================================================================
       * Section 1 — Preferences
       * ================================================================ */}
      <section id="preferences" className="mb-8">
        <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold">
          {t("settings.preferences.heading")}
        </h2>

        {/* Locale */}
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.preferences.language")}
          </legend>
          <div className="flex gap-2">
            {(["en", "fr"] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => handleLocaleChange(loc)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  prefs.locale === loc
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-muted hover:border-text-faint hover:text-text",
                ].join(" ")}
              >
                {loc === "en" ? "English" : "Fran\u00e7ais"}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Color scheme */}
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.scheme.label")}
          </legend>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((scheme) => (
              <button
                key={scheme}
                type="button"
                onClick={() => update({ colorScheme: scheme })}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  prefs.colorScheme === scheme
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-muted hover:border-text-faint hover:text-text",
                ].join(" ")}
              >
                {t(SCHEME_KEYS[scheme])}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Perform force dark */}
        <fieldset className="mb-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.performForceDark}
              onChange={(e) => update({ performForceDark: e.target.checked })}
              className="h-4 w-4 rounded accent-[var(--color-accent)]"
            />
            <span className="text-sm text-text">{t("settings.scheme.forceDark")}</span>
          </label>
          <p className="mt-1 pl-7 text-xs text-text-faint">{t("settings.scheme.forceDarkDesc")}</p>
        </fieldset>

        {/* Double-tap to scale text */}
        <fieldset className="mb-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.performDoubleTapScale}
              onChange={(e) => update({ performDoubleTapScale: e.target.checked })}
              className="h-4 w-4 rounded accent-[var(--color-accent)]"
            />
            <span className="text-sm text-text">{t("settings.scheme.doubleTapScale")}</span>
          </label>
          <p className="mt-1 pl-7 text-xs text-text-faint">
            {t("settings.scheme.doubleTapScaleDesc")}
          </p>
        </fieldset>

        {/* Accent color */}
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.accent.label")}
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                title={t(ACCENT_KEYS[preset.name] ?? preset.name)}
                onClick={() => update({ accentColor: preset.color })}
                className={[
                  "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  prefs.accentColor === preset.color
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-muted hover:border-text-faint hover:text-text",
                ].join(" ")}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: preset.color }}
                />
                {t(ACCENT_KEYS[preset.name] ?? preset.name)}
              </button>
            ))}
            {/* Custom color picker */}
            <label
              className={[
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors cursor-pointer",
                !matchedAccent
                  ? "border-accent bg-accent-muted text-accent"
                  : "border-border text-text-muted hover:border-text-faint hover:text-text",
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
        </fieldset>

        {/* Favorite instrument */}
        <fieldset className="mb-2">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.instrument.label")}
          </legend>
          <div className="flex gap-2">
            {(["guitar", "piano"] as const).map((inst) => (
              <button
                key={inst}
                type="button"
                onClick={() => update({ favoriteInstrument: inst })}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  prefs.favoriteInstrument === inst
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-muted hover:border-text-faint hover:text-text",
                ].join(" ")}
              >
                {t(INSTRUMENT_KEYS[inst])}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      {/* ================================================================
       * Section — Install the app (hidden when already standalone)
       * ================================================================ */}
      {detectPlatform() !== "standalone" && (
        <section id="install" className="mb-8">
          <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold">
            {t("settings.install.heading")}
          </h2>
          <p className="mb-4 text-sm text-text-muted">{t("settings.install.desc")}</p>
          <button type="button" onClick={requestPwaPrompt} className="btn btn-outline">
            {t("settings.install.action")}
          </button>
        </section>
      )}

      {/* ================================================================
       * Section 2 — Display (performance mode)
       * ================================================================ */}
      <section id="display" className="mb-8">
        <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold">
          {t("settings.display.heading")}
        </h2>

        <p className="mb-4 text-sm text-text-muted">{t("settings.display.desc")}</p>

        {/* Global scale */}
        <fieldset className="mb-6">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.display.globalSize")}
          </legend>
          <label className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-text">{t("settings.display.scale")}</span>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={prefs.globalScale}
              onChange={(e) => update({ globalScale: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="w-16 text-right text-sm text-text-muted">{prefs.globalScale}x</span>
          </label>
          <p className="mt-1 pl-[7.75rem] text-xs text-text-faint">
            {t("settings.display.scaleDesc")}
          </p>
        </fieldset>

        {/* Individual sizes */}
        <fieldset className="mb-6">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.sizes.heading")}
          </legend>
          <div className="flex flex-col gap-4">
            <SizeField
              label={t("settings.sizes.lyrics")}
              value={prefs.lyricsSize}
              onChange={(v) => update({ lyricsSize: v })}
            />
            <SizeField
              label={t("settings.sizes.chords")}
              value={prefs.chordSize}
              onChange={(v) => update({ chordSize: v })}
            />
            <SizeField
              label={t("settings.sizes.sectionLabels")}
              value={prefs.sectionSize}
              onChange={(v) => update({ sectionSize: v })}
            />
          </div>
        </fieldset>

        {/* Color theme presets */}
        <fieldset className="mb-6">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.theme.heading")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_THEMES.map((theme) => (
              <button
                key={theme.name}
                type="button"
                onClick={() => applyTheme(theme)}
                className={[
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  activeTheme === theme.name
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-muted hover:border-text-faint hover:text-text",
                ].join(" ")}
              >
                <ThemeSwatches theme={theme} />
                {t(THEME_NAME_KEYS[theme.name] ?? theme.name)}
              </button>
            ))}
            {!activeTheme && (
              <span className="flex items-center rounded-md border border-accent bg-accent-muted px-3 py-2 text-sm text-accent">
                {t("common.custom")}
              </span>
            )}
          </div>
        </fieldset>

        {/* Individual colors */}
        <fieldset className="mb-6">
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.colors.heading")}
          </legend>
          <div className="flex flex-col gap-4">
            <ColorField
              label={t("settings.colors.chords")}
              value={prefs.chordColor}
              onChange={(v) => update({ chordColor: v })}
            />
            <ColorField
              label={t("settings.colors.verse")}
              value={prefs.verseColor}
              onChange={(v) => update({ verseColor: v })}
            />
            <ColorField
              label={t("settings.colors.chorus")}
              value={prefs.chorusColor}
              onChange={(v) => update({ chorusColor: v })}
            />
            <ColorField
              label={t("settings.colors.bridge")}
              value={prefs.bridgeColor}
              onChange={(v) => update({ bridgeColor: v })}
            />
          </div>
        </fieldset>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleExport} className="btn btn-outline">
            {t("common.export")}
          </button>
          <button type="button" onClick={handleImport} className="btn btn-ghost">
            {t("common.import")}
          </button>
          <button type="button" onClick={handleReset} className="btn btn-ghost">
            {t("settings.preferences.resetToDefaults")}
          </button>
        </div>
      </section>

      {/* ================================================================
       * Section 3 — Profiles
       * ================================================================ */}
      <section id="profiles" className="mb-8">
        <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold">Profiles</h2>

        <p className="mb-4 text-sm text-text-muted">
          Each profile has its own songs, setlists, and sync configuration.
        </p>

        <ProfileManager />
      </section>

      {/* ================================================================
       * Section 4 — Synchronization
       * ================================================================ */}
      <section id="sync" className="mb-8">
        <h2 className="mb-4 border-b border-border pb-2 text-lg font-semibold">
          {t("settings.sync.heading")}
        </h2>

        <p className="mb-4 text-sm text-text-muted">{t("settings.sync.desc")}</p>

        <div className="flex flex-col gap-3">
          <GitHubConfigForm profileId={profileId} defaultOpen={scrollTarget === "github"} />
          <GoogleDriveConfigForm
            profileId={profileId}
            defaultOpen={scrollTarget === "google-drive"}
          />
        </div>
      </section>

      <div aria-live="polite">
        {status.type === "success" && <p className="mt-4 text-sm text-accent">{status.message}</p>}
        {status.type === "error" && <p className="mt-4 text-sm text-danger">{status.message}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

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

function SizeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-text">{label}</span>
      <input
        type="range"
        min={0.5}
        max={4}
        step={0.125}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-16 text-right text-sm text-text-muted">{value}rem</span>
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-text">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
        }}
        className="field w-24"
        maxLength={7}
      />
    </label>
  );
}
