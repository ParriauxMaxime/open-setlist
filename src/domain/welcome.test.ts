import { DEFAULT_PREFERENCES } from "./preferences";
import {
  applyWelcomeChoices,
  chordInstrumentForPart,
  hasOwnProfile,
  pickTrySetlist,
  pickWelcome,
  WELCOME,
  type WelcomeFlags,
  WHATS_NEW_ITEMS,
  WHATS_NEW_VERSION,
} from "./welcome";

const NEW_USER: WelcomeFlags = {
  firstRunDone: false,
  onboardingDismissed: false,
  hasOwnProfile: false,
  whatsNewSeen: null,
};

describe("pickWelcome", () => {
  it("sets up a new user", () => {
    expect(pickWelcome(NEW_USER)).toBe(WELCOME.firstRun);
  });

  it("shows nothing once the setup is done (it marks this version's news as seen)", () => {
    const flags = { ...NEW_USER, firstRunDone: true, whatsNewSeen: WHATS_NEW_VERSION };
    expect(pickWelcome(flags)).toBeNull();
  });

  it("never sets up a user who dismissed Getting Started: What's new instead", () => {
    expect(pickWelcome({ ...NEW_USER, onboardingDismissed: true })).toBe(WELCOME.whatsNew);
  });

  it("treats a user with their own profile (created or joined) as returning", () => {
    expect(pickWelcome({ ...NEW_USER, hasOwnProfile: true })).toBe(WELCOME.whatsNew);
  });

  it("shows What's new once per version", () => {
    const returning = { ...NEW_USER, onboardingDismissed: true };
    expect(pickWelcome({ ...returning, whatsNewSeen: "2026-10" }, "2026-10")).toBeNull();
    expect(pickWelcome({ ...returning, whatsNewSeen: "2026-10" }, "2027-01")).toBe(
      WELCOME.whatsNew,
    );
  });

  it("brings a set-up user the next version's news", () => {
    const flags = { ...NEW_USER, firstRunDone: true, whatsNewSeen: "2026-10" };
    expect(pickWelcome(flags, "2027-01")).toBe(WELCOME.whatsNew);
  });
});

describe("hasOwnProfile", () => {
  it("ignores the demo profile", () => {
    expect(hasOwnProfile([{ id: "d", name: "Demo", isDemo: true, createdAt: 0 }])).toBe(false);
    expect(
      hasOwnProfile([
        { id: "d", name: "Demo", isDemo: true, createdAt: 0 },
        { id: "b", name: "The Band", createdAt: 1 },
      ]),
    ).toBe(true);
  });
});

describe("chordInstrumentForPart", () => {
  it("maps guitar and keys to chord diagrams", () => {
    expect(chordInstrumentForPart("guitar")).toBe("guitar");
    expect(chordInstrumentForPart("keys")).toBe("piano");
  });

  it("has nothing for instruments without diagrams", () => {
    expect(chordInstrumentForPart("trumpet")).toBeUndefined();
    expect(chordInstrumentForPart("drums")).toBeUndefined();
  });
});

describe("applyWelcomeChoices", () => {
  const base = { ...DEFAULT_PREFERENCES, notation: "english" as const, locale: "en" as const };

  it("sets My part, notation and language", () => {
    const prefs = applyWelcomeChoices(base, { part: "trumpet", notation: "solfege", locale: "fr" });
    expect(prefs).toMatchObject({ partInstrument: "trumpet", notation: "solfege", locale: "fr" });
  });

  it("keeps chord diagrams when the instrument has none", () => {
    const prefs = applyWelcomeChoices(
      { ...base, favoriteInstrument: "piano" },
      { part: "alto-sax", notation: "english", locale: "en" },
    );
    expect(prefs).toMatchObject({ partInstrument: "alto-sax", favoriteInstrument: "piano" });
  });

  it("switches chord diagrams to the instrument played", () => {
    const prefs = applyWelcomeChoices(base, { part: "keys", notation: "german", locale: "en" });
    expect(prefs).toMatchObject({ partInstrument: "keys", favoriteInstrument: "piano" });
  });

  it("leaves My part alone when no instrument is picked", () => {
    const prefs = applyWelcomeChoices(
      { ...base, partInstrument: "bass" },
      { part: null, notation: "english", locale: "en" },
    );
    expect(prefs.partInstrument).toBe("bass");
    expect(prefs.favoriteInstrument).toBe(base.favoriteInstrument);
  });

  it("keeps every other preference", () => {
    const prefs = applyWelcomeChoices(
      { ...base, chordColor: "#ffffff", partShowChords: false },
      { part: "vocals", notation: "english", locale: "en" },
    );
    expect(prefs).toMatchObject({ chordColor: "#ffffff", partShowChords: false });
  });
});

describe("pickTrySetlist", () => {
  it("opens the last edited setlist", () => {
    const setlists = [
      { id: "a", updatedAt: 1, date: "2026-01-01" },
      { id: "b", updatedAt: 5, date: "2025-01-01" },
    ];
    expect(pickTrySetlist(setlists)?.id).toBe("b");
  });

  it("opens the earliest gig among untouched (demo) setlists", () => {
    const setlists = [
      { id: "late", updatedAt: 7, date: "2026-05-03" },
      { id: "early", updatedAt: 7, date: "2026-03-08" },
    ];
    expect(pickTrySetlist(setlists)?.id).toBe("early");
  });

  it("has nothing to open without setlists", () => {
    expect(pickTrySetlist([])).toBeUndefined();
  });
});

describe("WHATS_NEW_ITEMS", () => {
  it("lists eight features with unique ids", () => {
    expect(WHATS_NEW_ITEMS).toHaveLength(8);
    expect(new Set(WHATS_NEW_ITEMS.map((i) => i.id)).size).toBe(8);
  });
});
