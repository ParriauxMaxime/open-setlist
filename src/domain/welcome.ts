/**
 * Welcome: a one-screen setup the first time the app opens, a "What's new" card for
 * returning users when features land.
 *
 * Returning users are recognised by the legacy "Getting Started" dismissal or by a profile
 * of their own (created, migrated or joined through an invite): they never get the setup.
 */

import type { Setlist } from "@db/setlist";
import { useSyncExternalStore } from "react";
import type { Notation } from "./chords/notation";
import { useOnboardingDismissed } from "./onboarding";
import type { Part } from "./parts";
import { type AppPreferences, appPreferencesSchema } from "./preferences";
import { type Profile, useProfiles } from "./profiles";

/** Bump with each What's new list: returning users see the card once per version. */
export const WHATS_NEW_VERSION = "2026-10";

export const WELCOME = {
  firstRun: "first-run",
  whatsNew: "whats-new",
} as const;

export type Welcome = (typeof WELCOME)[keyof typeof WELCOME];

export interface WelcomeFlags {
  /** First-run setup done or skipped. */
  firstRunDone: boolean;
  /** "Getting Started" banner dismissed: the user was here before the first-run setup. */
  onboardingDismissed: boolean;
  /** A profile other than the demo exists. */
  hasOwnProfile: boolean;
  /** What's new version last seen, null when never. */
  whatsNewSeen: string | null;
}

/** First-run setup for new users, What's new for returning ones until they close it. */
export function pickWelcome(flags: WelcomeFlags, version = WHATS_NEW_VERSION): Welcome | null {
  const returning = flags.firstRunDone || flags.onboardingDismissed || flags.hasOwnProfile;
  if (!returning) return WELCOME.firstRun;
  return flags.whatsNewSeen === version ? null : WELCOME.whatsNew;
}

export function hasOwnProfile(profiles: Profile[]): boolean {
  return profiles.some((p) => !p.isDemo);
}

// ---------------------------------------------------------------------------
// First-run choices → preferences
// ---------------------------------------------------------------------------

type ChordInstrument = AppPreferences["favoriteInstrument"];

const CHORD_INSTRUMENTS: readonly string[] =
  appPreferencesSchema.shape.favoriteInstrument.unwrap().options;

/** Chord-diagram instrument of a part, applied when the chord reference offers it. */
const PART_CHORD_INSTRUMENT: Partial<Record<Part, string>> = {
  guitar: "guitar",
  keys: "piano",
  bass: "bass",
};

function isChordInstrument(value: string | undefined): value is ChordInstrument {
  return value !== undefined && CHORD_INSTRUMENTS.includes(value);
}

/** Chord diagrams for a part: guitar → guitar, keys → piano; undefined when none fits. */
export function chordInstrumentForPart(part: Part): ChordInstrument | undefined {
  const instrument = PART_CHORD_INSTRUMENT[part];
  return isChordInstrument(instrument) ? instrument : undefined;
}

export interface WelcomeChoices {
  /** "I play…": null keeps the current My part. */
  part: Part | null;
  notation: Notation;
  locale: AppPreferences["locale"];
}

/** Preferences after the first-run setup: My part, chord diagrams where they map, notation, language. */
export function applyWelcomeChoices(
  prefs: AppPreferences,
  choices: WelcomeChoices,
): AppPreferences {
  const chordInstrument = choices.part ? chordInstrumentForPart(choices.part) : undefined;
  return {
    ...prefs,
    locale: choices.locale,
    notation: choices.notation,
    partInstrument: choices.part ?? prefs.partInstrument,
    favoriteInstrument: chordInstrument ?? prefs.favoriteInstrument,
  };
}

// ---------------------------------------------------------------------------
// What's new
// ---------------------------------------------------------------------------

/** Where a What's new "Try it" link goes. */
export const WHATS_NEW_TARGET = {
  perform: "perform",
  print: "print",
  import: "import",
  newSong: "new-song",
  settings: "settings",
} as const;

export type WhatsNewTarget = (typeof WHATS_NEW_TARGET)[keyof typeof WHATS_NEW_TARGET];

export interface WhatsNewItem {
  /** i18n key under `welcome.whatsNew.items`. */
  id: string;
  target?: WhatsNewTarget;
}

export const WHATS_NEW_ITEMS: readonly WhatsNewItem[] = [
  { id: "myPart", target: WHATS_NEW_TARGET.perform },
  { id: "myNotes", target: WHATS_NEW_TARGET.perform },
  { id: "tempo", target: WHATS_NEW_TARGET.perform },
  { id: "notation", target: WHATS_NEW_TARGET.settings },
  { id: "print", target: WHATS_NEW_TARGET.print },
  { id: "readiness" },
  { id: "setlistHelper", target: WHATS_NEW_TARGET.import },
  { id: "pasteChart", target: WHATS_NEW_TARGET.newSong },
];

/** Setlist the "Try it" links open: the last edited, else the earliest gig (demo order). */
export function pickTrySetlist<T extends Pick<Setlist, "updatedAt" | "date">>(
  setlists: readonly T[],
): T | undefined {
  return [...setlists].sort(
    (a, b) => b.updatedAt - a.updatedAt || (a.date ?? "").localeCompare(b.date ?? ""),
  )[0];
}

// ---------------------------------------------------------------------------
// Persistence (localStorage) + React hook
// ---------------------------------------------------------------------------

const FIRST_RUN_KEY = "open-setlist-first-run-done";
const WHATS_NEW_KEY = "open-setlist-whats-new-seen";

let listeners: Array<() => void> = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getFirstRunSnapshot(): string | null {
  return localStorage.getItem(FIRST_RUN_KEY);
}

function getWhatsNewSnapshot(): string | null {
  return localStorage.getItem(WHATS_NEW_KEY);
}

/** Setup done or skipped. Everything is new to a new user: no What's new for this version. */
export function completeFirstRun(): void {
  localStorage.setItem(FIRST_RUN_KEY, "1");
  localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION);
  notifyListeners();
}

export function markWhatsNewSeen(): void {
  localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION);
  notifyListeners();
}

/** What to welcome the user with; follows profile switches and dismissals. */
export function useWelcome(): Welcome | null {
  const firstRunDone = useSyncExternalStore(subscribe, getFirstRunSnapshot) === "1";
  const whatsNewSeen = useSyncExternalStore(subscribe, getWhatsNewSnapshot);
  const profiles = useProfiles();
  const onboardingDismissed = useOnboardingDismissed();
  return pickWelcome({
    firstRunDone,
    onboardingDismissed,
    hasOwnProfile: hasOwnProfile(profiles),
    whatsNewSeen,
  });
}
