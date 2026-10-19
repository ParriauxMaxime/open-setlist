import { SETTINGS_SECTION, type SettingsSection } from "@domain/settings-sections";
import { Link } from "@swan-io/chicane";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

export const SETTINGS_NAV = [
  {
    section: SETTINGS_SECTION.preferences,
    labelKey: "settings.preferences.heading",
    descKey: "settings.preferences.desc",
    icon: "⚙",
  },
  {
    section: SETTINGS_SECTION.display,
    labelKey: "settings.display.heading",
    descKey: "settings.display.desc",
    icon: "🎸",
  },
  {
    section: SETTINGS_SECTION.profiles,
    labelKey: "settings.profile.heading",
    descKey: "settings.profile.desc",
    icon: "👥",
  },
  { section: SETTINGS_SECTION.midi, labelKey: "midi.heading", descKey: "midi.desc", icon: "🎛" },
  {
    section: SETTINGS_SECTION.about,
    labelKey: "onboarding.about.heading",
    descKey: "settings.about.desc",
    icon: "ℹ",
  },
] as const;

interface SettingsNavProps {
  active: SettingsSection;
}

/** Sub-navigation of the settings area: a column on desktop, a scrolling strip on phones. */
export function SettingsNav({ active }: SettingsNavProps) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("settings.title")}
      className="-mx-page flex gap-1 overflow-x-auto px-page pb-2 [scrollbar-width:none] md:mx-0 md:w-48 md:shrink-0 md:flex-col md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {SETTINGS_NAV.map(({ section, labelKey, icon }) => {
        const selected = section === active;
        return (
          <Link
            key={section}
            to={Router.SettingsSection({ section })}
            aria-current={selected ? "page" : undefined}
            className={[
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
              selected
                ? "bg-accent-muted text-accent"
                : "text-text-muted hover:bg-bg-hover hover:text-text",
            ].join(" ")}
          >
            <span aria-hidden="true">{icon}</span>
            {t(labelKey)}
          </Link>
        );
      })}
      <Link
        to={Router.Sync()}
        className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text md:mt-2 md:border-t md:border-border md:pt-3"
      >
        <span aria-hidden="true">⇄</span>
        {t("settings.sync.heading")}
        <span className="text-xs text-text-faint" aria-hidden="true">
          ↗
        </span>
      </Link>
    </nav>
  );
}
