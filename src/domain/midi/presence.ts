/**
 * What this device reports to the companion every few seconds: who it is, the page it
 * shows, where it is on stage and how its last MIDI send went. The stage view and the MIDI
 * sender write here; the companion link reads it at each heartbeat.
 */

import { type DevicePlatform, deviceDisplayName } from "../device";
import {
  type DevicePresence,
  MIDI_LAST_SEND,
  type MidiLastSend,
  PRESENCE_TRANSPORT,
} from "./companion";
import { nudgeHeartbeat } from "./companion-link";
import type { FollowMode, MidiSettings } from "./settings";
import { patchEncoding } from "./settings";

/** Where a stage view is: its setlist, its song and that song's slot. */
export interface StageReport {
  setlistId?: string;
  songId?: string;
  index?: number;
  /** The follow mode the stage view runs in, when it differs from the saved one. */
  follow?: FollowMode;
}

let stage: StageReport = {};
let lastSend: MidiLastSend = MIDI_LAST_SEND.none;

export function reportStage(next: StageReport): void {
  stage = next;
  nudgeHeartbeat();
}

export function reportMidiSend(outcome: MidiLastSend): void {
  lastSend = outcome;
  nudgeHeartbeat();
}

export function currentStageReport(): { stage: StageReport; lastSend: MidiLastSend } {
  return { stage, lastSend };
}

export interface PresenceInput {
  id: string;
  /** The part's name in the app's language. */
  partLabel: string;
  platform: DevicePlatform;
  appVersion: string;
  page: string;
  settings: MidiSettings;
  stage: StageReport;
  lastSend: MidiLastSend;
}

export function buildPresence(input: PresenceInput): DevicePresence {
  const { settings, stage } = input;
  return {
    id: input.id,
    name: deviceDisplayName(settings.deviceName, input.partLabel, input.platform),
    part: settings.role ?? "",
    platform: input.platform,
    appVersion: input.appVersion,
    page: input.page,
    setlistId: stage.setlistId,
    songId: stage.songId,
    index: stage.index,
    follow: stage.follow ?? settings.follow,
    midi: settings.enabled
      ? {
          transport: settings.transport,
          lastSend: input.lastSend,
          channel: patchEncoding(settings).channel,
        }
      : { transport: PRESENCE_TRANSPORT.off, lastSend: input.lastSend },
  };
}
