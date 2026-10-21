import { DEVICE_PLATFORM } from "../device";
import { MIDI_LAST_SEND } from "./companion";
import { buildPresence, type PresenceInput } from "./presence";
import { DEFAULT_MIDI_SETTINGS, FOLLOW_MODE } from "./settings";

const input: PresenceInput = {
  id: "tablet-1",
  partLabel: "Keys",
  platform: DEVICE_PLATFORM.iPad,
  appVersion: "abc1234",
  page: "Catalog",
  settings: { ...DEFAULT_MIDI_SETTINGS, role: "keys" },
  stage: {},
  lastSend: MIDI_LAST_SEND.none,
};

describe("buildPresence", () => {
  it("names the device after its part and platform, MIDI off", () => {
    expect(buildPresence(input)).toEqual({
      id: "tablet-1",
      name: "Keys · iPad",
      part: "keys",
      platform: "iPad",
      appVersion: "abc1234",
      page: "Catalog",
      follow: FOLLOW_MODE.off,
      midi: { transport: "off", lastSend: "none" },
    });
  });

  it("tells where the stage view is and how MIDI goes", () => {
    const presence = buildPresence({
      ...input,
      page: "Perform",
      settings: { ...input.settings, enabled: true, deviceName: "Max" },
      stage: { setlistId: "gig", songId: "s3", index: 2, follow: FOLLOW_MODE.lead },
      lastSend: MIDI_LAST_SEND.failed,
    });
    expect(presence).toMatchObject({
      name: "Max",
      setlistId: "gig",
      songId: "s3",
      index: 2,
      follow: FOLLOW_MODE.lead,
      midi: { transport: "wifi", lastSend: "failed", channel: 15 },
    });
  });
});
