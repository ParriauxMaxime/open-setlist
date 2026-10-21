import { MIDI_TRANSPORT, normalizeCompanionAddress, saveMidiSettings } from "@domain/midi/settings";
import {
  parseSettingsSection,
  SETTINGS_SECTION,
  type SettingsSection,
} from "@domain/settings-sections";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { AboutSection } from "./components/about-section";
import { DisplaySection } from "./components/display-section";
import { PreferencesSection } from "./components/preferences-section";
import { ProfileManager } from "./components/profile-manager";
import { SETTINGS_NAV, SettingsNav } from "./components/settings-nav";
import { StageMidiSettings } from "./components/stage-midi-settings";
import { usePreferences } from "./hooks/use-preferences";

interface SettingsPageProps {
  /** `/settings/<section>`; the bare `/settings` opens the first section. */
  section?: string;
  /** Companion address from the QR code on its status page (`?companion=192.168.1.20:7777`). */
  companion?: string;
}

export function SettingsPage({ section, companion }: SettingsPageProps) {
  const active = parseSettingsSection(section);

  // Scanned from the companion program's screen: remember it, then open the MIDI page
  useEffect(() => {
    const base = companion ? normalizeCompanionAddress(companion) : null;
    if (base) {
      saveMidiSettings({ companion: base, companionPaused: false, transport: MIDI_TRANSPORT.wifi });
    }
    if (!active) {
      Router.replace("SettingsSection", {
        section: base ? SETTINGS_SECTION.midi : SETTINGS_SECTION.preferences,
      });
    }
  }, [companion, active]);

  if (!active) return null;
  return <SettingsLayout active={active} />;
}

function SettingsLayout({ active }: { active: SettingsSection }) {
  const { t } = useTranslation();
  const { prefs, update, replace } = usePreferences();
  const entry = SETTINGS_NAV.find((item) => item.section === active);

  return (
    <div className="p-page">
      <h1 className="mb-4 text-2xl font-bold">{t("settings.title")}</h1>

      <div className="flex flex-col gap-4 md:flex-row md:gap-8">
        <SettingsNav active={active} />

        <div className="min-w-0 max-w-2xl flex-1">
          {entry && (
            <>
              <h2 className="text-lg font-semibold">{t(entry.labelKey)}</h2>
              <p className="mb-5 text-sm text-text-muted">{t(entry.descKey)}</p>
            </>
          )}
          <SectionBody active={active} prefs={prefs} update={update} replace={replace} />
        </div>
      </div>
    </div>
  );
}

type SectionBodyProps = { active: SettingsSection } & ReturnType<typeof usePreferences>;

function SectionBody({ active, prefs, update, replace }: SectionBodyProps) {
  switch (active) {
    case SETTINGS_SECTION.preferences:
      return <PreferencesSection prefs={prefs} update={update} />;
    case SETTINGS_SECTION.display:
      return <DisplaySection prefs={prefs} update={update} replace={replace} />;
    case SETTINGS_SECTION.profiles:
      return <ProfileManager />;
    case SETTINGS_SECTION.midi:
      return <StageMidiSettings />;
    case SETTINGS_SECTION.about:
      return <AboutSection />;
  }
}
