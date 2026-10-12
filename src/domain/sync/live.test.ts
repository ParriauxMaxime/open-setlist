import { deriveBandKeys, generateBandCode } from "./band-code";
import {
  followIndex,
  LIVE_MODE,
  type LiveMessage,
  loadLiveMode,
  openLiveMessage,
  saveLiveMode,
  sealLiveMessage,
} from "./live";
import { installMemoryLocalStorage } from "./test-fakes";

const SONGS = ["intro", "ballad", "rocker", "ballad"];

describe("followIndex", () => {
  it("goes to the leader's slot when it holds the same song", () => {
    expect(followIndex({ setlistId: "gig", songId: "ballad", index: 3 }, "gig", SONGS)).toBe(3);
    expect(followIndex({ setlistId: "gig", songId: "intro", index: 0 }, "gig", SONGS)).toBe(0);
  });

  it("finds the song when this device's copy of the setlist is ordered differently", () => {
    expect(followIndex({ setlistId: "gig", songId: "rocker", index: 0 }, "gig", SONGS)).toBe(2);
    expect(followIndex({ setlistId: "gig", songId: "rocker", index: 9 }, "gig", SONGS)).toBe(2);
  });

  it("stays put for another setlist or a song this device does not have", () => {
    expect(followIndex({ setlistId: "other", songId: "intro", index: 0 }, "gig", SONGS)).toBeNull();
    expect(followIndex({ setlistId: "gig", songId: "new", index: 1 }, "gig", SONGS)).toBeNull();
  });
});

describe("live mode", () => {
  beforeEach(installMemoryLocalStorage);

  it("is off until the musician turns it on, per profile", () => {
    expect(loadLiveMode("p1")).toBe(LIVE_MODE.off);
    saveLiveMode("p1", LIVE_MODE.follow);
    expect(loadLiveMode("p1")).toBe(LIVE_MODE.follow);
    expect(loadLiveMode("p2")).toBe(LIVE_MODE.off);
    saveLiveMode("p1", LIVE_MODE.off);
    expect(loadLiveMode("p1")).toBe(LIVE_MODE.off);
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem("open-setlist-live-mode-p1", "conduct");
    expect(loadLiveMode("p1")).toBe(LIVE_MODE.off);
  });
});

describe("live messages", () => {
  const position: LiveMessage = {
    type: "position",
    from: "device-a",
    setlistId: "gig",
    songId: "rocker",
    index: 2,
  };

  it("are readable by the band only", async () => {
    const keys = await deriveBandKeys(generateBandCode());
    const sealed = await sealLiveMessage(keys, position);
    expect(new TextDecoder().decode(sealed)).not.toContain("rocker");
    expect(await openLiveMessage(keys, sealed)).toEqual(position);

    const otherBand = await deriveBandKeys(generateBandCode());
    expect(await openLiveMessage(otherBand, sealed)).toBeNull();
  });

  it("drop tampered or malformed content", async () => {
    const keys = await deriveBandKeys(generateBandCode());
    const sealed = await sealLiveMessage(keys, position);
    sealed[sealed.length - 1] ^= 1;
    expect(await openLiveMessage(keys, sealed)).toBeNull();
    expect(await openLiveMessage(keys, new Uint8Array([1, 2, 3]))).toBeNull();

    const odd = await sealLiveMessage(keys, { type: "jump", from: "x" } as unknown as LiveMessage);
    expect(await openLiveMessage(keys, odd)).toBeNull();
  });
});
