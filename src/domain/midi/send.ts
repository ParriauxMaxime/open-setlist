import { sendBleMidi } from "./bluetooth";
import { type CompanionOptions, sendToCompanion } from "./companion";
import { MIDI_TRANSPORT, type MidiSettings } from "./settings";

/** Sends MIDI messages the way this device is set up. Rejects when they did not go out. */
export function sendMidi(
  settings: Pick<MidiSettings, "transport" | "companion" | "role">,
  messages: number[][],
  options: CompanionOptions = {},
): Promise<void> {
  if (settings.transport === MIDI_TRANSPORT.bluetooth) return sendBleMidi(messages);
  return sendToCompanion(settings.companion, messages, settings.role ?? "", options);
}
