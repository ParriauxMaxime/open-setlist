import type { Song } from "@db";
import { BLE_STATE, connectBleMidi } from "@domain/midi/bluetooth";
import { parsePatchCode, patchMessages, songPatch } from "@domain/midi/patch";
import { sendMidi } from "@domain/midi/send";
import { MIDI_TRANSPORT, patchEncoding } from "@domain/midi/settings";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBleMidi, useMidiSettings } from "../../shared/hooks/use-midi-settings";

/** Flipping through songs must not fire a sound change for each one passed. */
const SETTLE_MS = 300;

export const STAGE_MIDI_STATE = {
  /** This song has no code for the musician's instrument: nothing to send. */
  noPatch: "noPatch",
  /** The code cannot be turned into MIDI (`9Z`). */
  badCode: "badCode",
  /** Bluetooth: no device connected, a tap is needed. */
  disconnected: "disconnected",
  sending: "sending",
  sent: "sent",
  failed: "failed",
} as const;

export type StageMidiState = (typeof STAGE_MIDI_STATE)[keyof typeof STAGE_MIDI_STATE];

export interface StageMidi {
  /** False until the musician turned MIDI on and set it up: nothing is shown. */
  active: boolean;
  state: StageMidiState;
  code: string | undefined;
  /** Sends again, or opens the Bluetooth chooser when no device is connected. */
  retry: () => void;
}

/** Sends the musician's sound change each time the song on stage changes. */
export function useStageMidi(song: Song | undefined): StageMidi {
  const settings = useMidiSettings();
  const ble = useBleMidi();
  const overBluetooth = settings.transport === MIDI_TRANSPORT.bluetooth;
  const active =
    settings.enabled &&
    Boolean(settings.role) &&
    (overBluetooth ? ble.state !== BLE_STATE.unsupported : Boolean(settings.companion));

  const code = useMemo(
    () => (song && settings.role ? songPatch(song, settings.role) : undefined),
    [song, settings.role],
  );
  const messages = useMemo(() => {
    const parsed = code ? parsePatchCode(code) : null;
    return parsed ? patchMessages(parsed, patchEncoding(settings)) : null;
  }, [code, settings]);
  const waitingForDevice = overBluetooth && ble.state !== BLE_STATE.connected;

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StageMidiState>(STAGE_MIDI_STATE.noPatch);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new song or a retry sends again
  useEffect(() => {
    if (!active) return;
    if (!code) return setState(STAGE_MIDI_STATE.noPatch);
    if (!messages) return setState(STAGE_MIDI_STATE.badCode);
    if (waitingForDevice) return setState(STAGE_MIDI_STATE.disconnected);

    setState(STAGE_MIDI_STATE.sending);
    const abort = new AbortController();
    const timer = setTimeout(() => {
      sendMidi(settings, messages, { signal: abort.signal }).then(
        () => setState(STAGE_MIDI_STATE.sent),
        () => {
          if (!abort.signal.aborted) setState(STAGE_MIDI_STATE.failed);
        },
      );
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [active, song?.id, code, messages, waitingForDevice, attempt]);

  const retry = useCallback(() => {
    if (waitingForDevice) connectBleMidi().catch(() => undefined);
    else setAttempt((n) => n + 1);
  }, [waitingForDevice]);

  return { active, state, code, retry };
}
