import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema & types
// ---------------------------------------------------------------------------

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const appPreferencesSchema = z.object({
  // --- App-level preferences ---
  locale: z.enum(["en", "fr"]).default("en"),
  colorScheme: z.enum(["light", "dark", "system"]).default("dark"),
  performForceDark: z.boolean().default(true),
  accentColor: hexColor.default("#4a9eff"),
  favoriteInstrument: z.enum(["guitar", "piano"]).default("guitar"),

  // --- Performance display ---
  globalScale: z.number().min(0.5).max(3).default(1),
  lyricsSize: z.number().min(0.5).max(5).default(1.5),
  chordSize: z.number().min(0.5).max(5).default(1.125),
  sectionSize: z.number().min(0.5).max(5).default(0.875),
  chordColor: hexColor.default("#f0a050"),
  verseColor: hexColor.default("#4a9eff"),
  chorusColor: hexColor.default("#f0a050"),
  bridgeColor: hexColor.default("#a07cf0"),
});

export type AppPreferences = z.infer<typeof appPreferencesSchema>;

/** @deprecated Use AppPreferences instead */
export type PerformPreferences = AppPreferences;

// ---------------------------------------------------------------------------
// Per-song display overrides
// ---------------------------------------------------------------------------

export type SongDisplayPrefs = Pick<
  AppPreferences,
  | "globalScale"
  | "lyricsSize"
  | "chordSize"
  | "sectionSize"
  | "chordColor"
  | "verseColor"
  | "chorusColor"
  | "bridgeColor"
>;

export const SONG_DISPLAY_PREF_KEYS = [
  "globalScale",
  "lyricsSize",
  "chordSize",
  "sectionSize",
  "chordColor",
  "verseColor",
  "chorusColor",
  "bridgeColor",
] as const satisfies readonly (keyof SongDisplayPrefs)[];

// ---------------------------------------------------------------------------
// Color themes
// ---------------------------------------------------------------------------

export interface ColorTheme {
  name: string;
  chordColor: string;
  verseColor: string;
  chorusColor: string;
  bridgeColor: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    name: "Stage Dark",
    chordColor: "#f0a050",
    verseColor: "#4a9eff",
    chorusColor: "#f0a050",
    bridgeColor: "#a07cf0",
  },
  {
    name: "High Contrast",
    chordColor: "#ffffff",
    verseColor: "#00ccff",
    chorusColor: "#ffcc00",
    bridgeColor: "#ff66cc",
  },
  {
    name: "Monokai",
    chordColor: "#a6e22e",
    verseColor: "#66d9ef",
    chorusColor: "#f92672",
    bridgeColor: "#ae81ff",
  },
  {
    name: "Paper",
    chordColor: "#c05020",
    verseColor: "#2060a0",
    chorusColor: "#a07020",
    bridgeColor: "#705090",
  },
];

export function matchThemeName(prefs: AppPreferences): string | null {
  for (const t of COLOR_THEMES) {
    if (
      t.chordColor === prefs.chordColor &&
      t.verseColor === prefs.verseColor &&
      t.chorusColor === prefs.chorusColor &&
      t.bridgeColor === prefs.bridgeColor
    ) {
      return t.name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Accent color presets
// ---------------------------------------------------------------------------

export interface AccentPreset {
  name: string;
  color: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: "Blue", color: "#4a9eff" },
  { name: "Purple", color: "#a07cf0" },
  { name: "Green", color: "#4ade80" },
  { name: "Orange", color: "#f0a050" },
  { name: "Pink", color: "#f06292" },
];

// ---------------------------------------------------------------------------
// Defaults — match current @theme values in global.css
// ---------------------------------------------------------------------------

export const DEFAULT_PREFERENCES: AppPreferences = {
  locale: "en",
  colorScheme: "dark",
  performForceDark: true,
  accentColor: "#4a9eff",
  favoriteInstrument: "guitar",
  globalScale: 1,
  lyricsSize: 1.5,
  chordSize: 1.125,
  sectionSize: 0.875,
  chordColor: "#f0a050",
  verseColor: "#4a9eff",
  chorusColor: "#f0a050",
  bridgeColor: "#a07cf0",
};

// ---------------------------------------------------------------------------
// Persistence (localStorage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "open-setlist-display-prefs";

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return appPreferencesSchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: AppPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

// ---------------------------------------------------------------------------
// Per-song display overrides (localStorage)
// ---------------------------------------------------------------------------

const SONG_OVERRIDES_KEY = "open-setlist-song-display-overrides";

export type SongOverridesMap = Record<string, Partial<SongDisplayPrefs>>;

export function loadSongOverrides(): SongOverridesMap {
  try {
    const raw = localStorage.getItem(SONG_OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SongOverridesMap;
  } catch {
    return {};
  }
}

export function saveSongOverrides(map: SongOverridesMap): void {
  localStorage.setItem(SONG_OVERRIDES_KEY, JSON.stringify(map));
}

export function getSongOverrides(songId: string): Partial<SongDisplayPrefs> {
  return loadSongOverrides()[songId] ?? {};
}

export function setSongOverrides(songId: string, patch: Partial<SongDisplayPrefs>): void {
  const map = loadSongOverrides();
  const current = map[songId] ?? {};
  const merged = { ...current, ...patch };
  // Remove keys set to undefined
  for (const k of Object.keys(merged) as (keyof SongDisplayPrefs)[]) {
    if (merged[k] === undefined) delete merged[k];
  }
  if (Object.keys(merged).length === 0) {
    delete map[songId];
  } else {
    map[songId] = merged;
  }
  saveSongOverrides(map);
}

export function removeSongOverrides(songId: string): void {
  const map = loadSongOverrides();
  delete map[songId];
  saveSongOverrides(map);
}

/** Resolve display prefs: global defaults merged with per-song overrides. */
export function resolveSongDisplayPrefs(
  global: AppPreferences,
  songId: string | undefined,
): SongDisplayPrefs {
  const base: SongDisplayPrefs = {
    globalScale: global.globalScale,
    lyricsSize: global.lyricsSize,
    chordSize: global.chordSize,
    sectionSize: global.sectionSize,
    chordColor: global.chordColor,
    verseColor: global.verseColor,
    chorusColor: global.chorusColor,
    bridgeColor: global.bridgeColor,
  };
  if (!songId) return base;
  const overrides = getSongOverrides(songId);
  return { ...base, ...overrides };
}

/** Build CSS custom-property map from song display prefs (same vars as applyPreferences). */
export function songDisplayCssVars(prefs: SongDisplayPrefs): Record<string, string> {
  const g = prefs.globalScale;
  return {
    "--text-perform-lyrics": `${prefs.lyricsSize * g}rem`,
    "--text-perform-chord": `${prefs.chordSize * g}rem`,
    "--text-perform-section": `${prefs.sectionSize * g}rem`,
    "--color-chord": prefs.chordColor,
    "--color-section-verse": `${prefs.verseColor}22`,
    "--color-section-chorus": `${prefs.chorusColor}22`,
    "--color-section-bridge": `${prefs.bridgeColor}22`,
  };
}

// ---------------------------------------------------------------------------
// Theme resolution
// ---------------------------------------------------------------------------

/** Resolve "system" to "light" or "dark" based on OS preference. */
export function resolveColorScheme(scheme: AppPreferences["colorScheme"]): "light" | "dark" {
  if (scheme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return scheme;
}

/** Compute a lighter hover variant from a hex color. */
function lightenHex(hex: string, amount = 0.2): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const lighten = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${lighten(r).toString(16).padStart(2, "0")}${lighten(g).toString(16).padStart(2, "0")}${lighten(b).toString(16).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// CSS application — override custom properties on :root
// ---------------------------------------------------------------------------

let mediaListener: (() => void) | null = null;

export function applyPreferences(prefs: AppPreferences): void {
  const root = document.documentElement;
  const s = root.style;

  // --- Theme ---
  const resolved = resolveColorScheme(prefs.colorScheme);
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;

  // Listen for system theme changes when set to "system"
  if (mediaListener) {
    mediaListener();
    mediaListener = null;
  }
  if (prefs.colorScheme === "system") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = mq.matches ? "dark" : "light";
      root.setAttribute("data-theme", r);
      root.style.colorScheme = r;
    };
    mq.addEventListener("change", handler);
    mediaListener = () => mq.removeEventListener("change", handler);
  }

  // --- Accent color ---
  s.setProperty("--color-accent", prefs.accentColor);
  s.setProperty("--color-accent-hover", lightenHex(prefs.accentColor));
  s.setProperty("--color-accent-muted", `${prefs.accentColor}33`);

  // --- Performance display ---
  const g = prefs.globalScale;
  s.setProperty("--text-perform-lyrics", `${prefs.lyricsSize * g}rem`);
  s.setProperty("--text-perform-chord", `${prefs.chordSize * g}rem`);
  s.setProperty("--text-perform-section", `${prefs.sectionSize * g}rem`);
  s.setProperty("--color-chord", prefs.chordColor);
  s.setProperty("--color-section-verse", `${prefs.verseColor}22`);
  s.setProperty("--color-section-chorus", `${prefs.chorusColor}22`);
  s.setProperty("--color-section-bridge", `${prefs.bridgeColor}22`);
}

// ---------------------------------------------------------------------------
// Export / Import (file download/upload)
// ---------------------------------------------------------------------------

export interface PreferencesExport {
  preferences: AppPreferences;
  songOverrides?: SongOverridesMap;
}

export function exportPreferences(prefs: AppPreferences): void {
  const payload: PreferencesExport = {
    preferences: prefs,
    songOverrides: loadSongOverrides(),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `open-setlist-display-prefs.json`;
  a.click();

  URL.revokeObjectURL(url);
}

export function importPreferences(): Promise<{
  preferences: AppPreferences;
  songOverrides?: SongOverridesMap;
}> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.addEventListener("change", async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          reject(new Error("No file selected"));
          return;
        }
        const text = await file.text();
        const data = JSON.parse(text);

        // Support both new format ({ preferences, songOverrides }) and legacy (bare object)
        if (data.preferences && typeof data.preferences === "object") {
          const prefs = appPreferencesSchema.parse(data.preferences);
          const songOverrides = data.songOverrides as SongOverridesMap | undefined;
          resolve({ preferences: prefs, songOverrides });
        } else {
          resolve({ preferences: appPreferencesSchema.parse(data) });
        }
      } catch (err) {
        reject(err);
      }
    });

    input.addEventListener("cancel", () => {
      reject(new DOMException("cancelled", "AbortError"));
    });

    input.click();
  });
}
