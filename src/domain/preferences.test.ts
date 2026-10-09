import { appPreferencesSchema, DEFAULT_PREFERENCES, resolvePartView } from "./preferences";

describe("resolvePartView", () => {
  it("defaults to every part, cues and chords on", () => {
    expect(resolvePartView(DEFAULT_PREFERENCES)).toEqual({
      instrument: "all",
      showCues: true,
      showChords: true,
      writtenPitch: true,
    });
  });

  it("falls back to a non-default favourite instrument", () => {
    const prefs = { ...DEFAULT_PREFERENCES, favoriteInstrument: "piano" as const };
    expect(resolvePartView(prefs).instrument).toBe("keys");
  });

  it("uses the part picked in performance mode", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      favoriteInstrument: "piano" as const,
      partInstrument: "Guitare",
      partShowChords: false,
    };
    expect(resolvePartView(prefs)).toEqual({
      instrument: "guitar",
      showCues: true,
      showChords: false,
      writtenPitch: true,
    });
  });

  it("keeps concert pitch when picked", () => {
    const prefs = { ...DEFAULT_PREFERENCES, partInstrument: "trompette", partWrittenPitch: false };
    expect(resolvePartView(prefs)).toMatchObject({ instrument: "trumpet", writtenPitch: false });
  });

  it("reads older saved preferences with written pitch on", () => {
    const { partWrittenPitch: _, ...older } = DEFAULT_PREFERENCES;
    expect(appPreferencesSchema.parse(older).partWrittenPitch).toBe(true);
  });

  it("keeps an explicit 'all'", () => {
    const prefs = { ...DEFAULT_PREFERENCES, favoriteInstrument: "piano" as const };
    expect(resolvePartView({ ...prefs, partInstrument: "all" }).instrument).toBe("all");
  });
});
