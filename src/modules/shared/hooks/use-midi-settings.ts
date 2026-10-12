import { type BleStatus, bleMidiStatus, subscribeBleMidi } from "@domain/midi/bluetooth";
import {
  type MidiSettings,
  parseMidiSettings,
  readStoredMidiSettings,
  subscribeMidiSettings,
} from "@domain/midi/settings";
import { useMemo, useSyncExternalStore } from "react";

/** This device's stage MIDI settings, live. */
export function useMidiSettings(): MidiSettings {
  const raw = useSyncExternalStore(subscribeMidiSettings, readStoredMidiSettings);
  return useMemo(() => parseMidiSettings(raw), [raw]);
}

export function useBleMidi(): BleStatus {
  return useSyncExternalStore(subscribeBleMidi, bleMidiStatus);
}
