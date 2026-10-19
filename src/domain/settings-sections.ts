/** Pages of the settings area, one route each: `/settings/<section>`. */
export const SETTINGS_SECTION = {
  preferences: "preferences",
  display: "display",
  profiles: "profiles",
  midi: "midi",
  about: "about",
} as const;

export type SettingsSection = (typeof SETTINGS_SECTION)[keyof typeof SETTINGS_SECTION];

export const SETTINGS_SECTION_VALUES = Object.values(SETTINGS_SECTION);

export function parseSettingsSection(value: string | undefined): SettingsSection | undefined {
  return SETTINGS_SECTION_VALUES.find((section) => section === value);
}
