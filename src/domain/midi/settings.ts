/**
 * Stage MIDI settings of this device. Everything is off until the musician turns it on:
 * by default each one changes song and sound on their own.
 *
 * Kept in localStorage, per device and never synced: a tablet belongs to one musician.
 */

import { z } from "zod";
import {
  defaultMidiChannel,
  defaultMidiEncoding,
  MIDI_ENCODING_VALUES,
  type PatchEncoding,
} from "./patch";

export const MIDI_TRANSPORT = {
  /** The companion program on the stage computer, over the band's Wi-Fi router. */
  wifi: "wifi",
  /** A Bluetooth MIDI device: the companion program, or any BLE MIDI gear. */
  bluetooth: "bluetooth",
} as const;

export type MidiTransport = (typeof MIDI_TRANSPORT)[keyof typeof MIDI_TRANSPORT];

export const MIDI_TRANSPORT_VALUES: MidiTransport[] = Object.values(MIDI_TRANSPORT);

export const FOLLOW_MODE = {
  off: "off",
  follow: "follow",
  lead: "lead",
} as const;

export type FollowMode = (typeof FOLLOW_MODE)[keyof typeof FOLLOW_MODE];

export const FOLLOW_MODE_VALUES: FollowMode[] = Object.values(FOLLOW_MODE);

export const COMPANION_DEFAULT_PORT = 7777;

const midiSettingsSchema = z.object({
  /** Send this musician's sound change when the song changes on stage. */
  enabled: z.boolean().default(false),
  /** The part whose patch codes this device sends (`keys`, `drums`...). */
  role: z.string().optional(),
  transport: z.enum(MIDI_TRANSPORT_VALUES as [MidiTransport, ...MidiTransport[]]).default("wifi"),
  /** Base URL of the companion program, e.g. `http://192.168.1.20:7777`. */
  companion: z.string().default(""),
  follow: z.enum(FOLLOW_MODE_VALUES as [FollowMode, ...FollowMode[]]).default(FOLLOW_MODE.off),
  // Unset: the role's default
  channel: z.number().int().min(1).max(16).optional(),
  encoding: z.enum(MIDI_ENCODING_VALUES as [string, ...string[]]).optional(),
  ccBank: z.number().int().min(0).max(127).default(21),
  ccSlot: z.number().int().min(0).max(127).default(20),
  programFromOne: z.boolean().default(true),
});

export type MidiSettings = z.infer<typeof midiSettingsSchema>;

export const DEFAULT_MIDI_SETTINGS: MidiSettings = midiSettingsSchema.parse({});

export function parseMidiSettings(raw: string | null): MidiSettings {
  if (!raw) return DEFAULT_MIDI_SETTINGS;
  try {
    return midiSettingsSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_MIDI_SETTINGS;
  }
}

export function patchEncoding(settings: MidiSettings): PatchEncoding {
  const role = settings.role ?? "";
  return {
    channel: settings.channel ?? defaultMidiChannel(role),
    encoding:
      MIDI_ENCODING_VALUES.find((e) => e === settings.encoding) ?? defaultMidiEncoding(role),
    ccBank: settings.ccBank,
    ccSlot: settings.ccSlot,
    programFromOne: settings.programFromOne,
  };
}

/**
 * What the musician typed or scanned (`192.168.1.20`, `studio.local:7777`, a full URL)
 * as the companion's base URL, over HTTPS unless the input said `http://`. null when it is
 * not an address. The companion answers both on its one port; `probeCompanion` finds out
 * which one this browser lets through.
 */
export function normalizeCompanionAddress(input: string): string | null {
  const trimmed = input.trim();
  const scheme = /^http:\/\//i.test(trimmed) ? "http" : "https";
  const text = trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const match = /^([a-z0-9]([a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?$/i.exec(text);
  if (!match) return null;
  const port = match[3] ? Number(match[3]) : COMPANION_DEFAULT_PORT;
  if (port < 1 || port > 65535) return null;
  return `${scheme}://${match[1].toLowerCase()}:${port}`;
}

/** The same companion over the other scheme: `https://…` ⇄ `http://…`. */
export function otherScheme(base: string): string {
  return base.startsWith("https://")
    ? base.replace(/^https:\/\//, "http://")
    : base.replace(/^http:\/\//, "https://");
}

/** `https://192.168.1.20:7777` → `192.168.1.20`, the default port left out. */
export function displayCompanionAddress(base: string): string {
  return base.replace(/^https?:\/\//, "").replace(new RegExp(`:${COMPANION_DEFAULT_PORT}$`), "");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "open-setlist-midi";

let listeners: Array<() => void> = [];

/** Called after any write made through this module (for useSyncExternalStore). */
export function subscribeMidiSettings(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function readStoredMidiSettings(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function loadMidiSettings(): MidiSettings {
  return parseMidiSettings(readStoredMidiSettings());
}

export function saveMidiSettings(patch: Partial<MidiSettings>): MidiSettings {
  const current = loadMidiSettings();
  // A half-typed number (empty, out of range) is not saved
  const next = midiSettingsSchema.safeParse({ ...current, ...patch });
  if (!next.success) return current;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next.data));
  for (const listener of listeners) listener();
  return next.data;
}
