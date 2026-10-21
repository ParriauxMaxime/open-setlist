import { deviceId } from "../device";
import { sendBleMidi } from "./bluetooth";
import { type CompanionOptions, MIDI_LAST_SEND, sendToCompanion } from "./companion";
import { reportMidiSend } from "./presence";
import { MIDI_TRANSPORT, type MidiSettings } from "./settings";

/** Sends MIDI messages the way this device is set up. Rejects when they did not go out. */
export async function sendMidi(
  settings: Pick<MidiSettings, "transport" | "companion" | "role">,
  messages: number[][],
  options: CompanionOptions = {},
): Promise<void> {
  try {
    if (settings.transport === MIDI_TRANSPORT.bluetooth) await sendBleMidi(messages);
    else {
      const sender = { from: settings.role ?? "", device: deviceId() };
      await sendToCompanion(settings.companion, messages, sender, options);
    }
    reportMidiSend(MIDI_LAST_SEND.ok);
  } catch (err) {
    if (!options.signal?.aborted) reportMidiSend(MIDI_LAST_SEND.failed);
    throw err;
  }
}
