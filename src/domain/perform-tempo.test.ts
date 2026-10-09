import { DEFAULT_PART_VIEW, writtenPitchShift } from "./chordpro/visibility";
import {
  beatInterval,
  beatsInWindow,
  beatsPerBar,
  buildSongPreview,
  CLICK_ACCENT_FREQUENCY_HZ,
  CLICK_FREQUENCY_HZ,
  clickFrequency,
  countInEndTime,
  createBeatRun,
  DEFAULT_BEATS_PER_BAR,
  isAccentBeat,
  isPlayableBpm,
  isSetBreak,
  playedKey,
  runEndTime,
  setLabel,
} from "./perform-tempo";

/** Shift of the device's "My part" (see visibility.ts), as the footer computes it. */
function partShift(instrument: string, capo?: number, writtenPitch = true): number {
  return writtenPitchShift({ ...DEFAULT_PART_VIEW, instrument, writtenPitch }, capo);
}

describe("isPlayableBpm", () => {
  it("accepts a normal tempo", () => {
    expect(isPlayableBpm(120)).toBe(true);
    expect(isPlayableBpm(72.5)).toBe(true);
  });

  it("rejects missing, non-finite and out-of-range values", () => {
    expect(isPlayableBpm(undefined)).toBe(false);
    expect(isPlayableBpm(0)).toBe(false);
    expect(isPlayableBpm(-90)).toBe(false);
    expect(isPlayableBpm(Number.NaN)).toBe(false);
    expect(isPlayableBpm(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPlayableBpm(1000)).toBe(false);
  });
});

describe("beatInterval", () => {
  it("is 60 / bpm seconds", () => {
    expect(beatInterval(120)).toBe(0.5);
    expect(beatInterval(60)).toBe(1);
  });
});

describe("beatsPerBar", () => {
  it.each([
    ["4/4", 4],
    ["3/4", 3],
    ["6/8", 6],
    [" 12 / 8 ", 12],
    ["2/2", 2],
  ])("reads the numerator of %j", (time, expected) => {
    expect(beatsPerBar(time)).toBe(expected);
  });

  it.each([undefined, "", "fast", "4", "0/4", "99/4", "3-4"])("falls back to 4 for %j", (time) => {
    expect(beatsPerBar(time)).toBe(DEFAULT_BEATS_PER_BAR);
  });
});

describe("accents", () => {
  it("accents beat 1 of every bar", () => {
    const pattern = Array.from({ length: 7 }, (_, i) => isAccentBeat(i, 3));
    expect(pattern).toEqual([true, false, false, true, false, false, true]);
  });

  it("uses a higher pitch for the accent", () => {
    expect(clickFrequency(true)).toBe(CLICK_ACCENT_FREQUENCY_HZ);
    expect(clickFrequency(false)).toBe(CLICK_FREQUENCY_HZ);
    expect(CLICK_ACCENT_FREQUENCY_HZ).toBeGreaterThan(CLICK_FREQUENCY_HZ);
  });
});

describe("createBeatRun", () => {
  it("runs forever for a plain pulse", () => {
    const run = createBeatRun({
      startTime: 10,
      bpm: 120,
      beatsPerBar: 4,
      countIn: false,
      continuous: true,
    });
    expect(run).toEqual({
      startTime: 10,
      interval: 0.5,
      beatsPerBar: 4,
      countInBeats: 0,
      totalBeats: null,
    });
    expect(runEndTime(run)).toBeNull();
    expect(countInEndTime(run)).toBeNull();
  });

  it("stops after one bar for a count-in alone", () => {
    const run = createBeatRun({
      startTime: 10,
      bpm: 120,
      beatsPerBar: 3,
      countIn: true,
      continuous: false,
    });
    expect(run.countInBeats).toBe(3);
    expect(run.totalBeats).toBe(3);
    expect(countInEndTime(run)).toBe(11.5);
    expect(runEndTime(run)).toBe(11.5);
  });

  it("keeps pulsing after a count-in when continuous", () => {
    const run = createBeatRun({
      startTime: 0,
      bpm: 60,
      beatsPerBar: 4,
      countIn: true,
      continuous: true,
    });
    expect(countInEndTime(run)).toBe(4);
    expect(runEndTime(run)).toBeNull();
  });
});

describe("beatsInWindow", () => {
  const pulse = createBeatRun({
    startTime: 1,
    bpm: 120,
    beatsPerBar: 4,
    countIn: false,
    continuous: true,
  });

  it("returns the beats falling inside the lookahead window", () => {
    const { beats, nextIndex } = beatsInWindow(pulse, 0, 0.95, 2.05);
    expect(beats.map((b) => b.time)).toEqual([1, 1.5, 2]);
    expect(beats.map((b) => b.beat)).toEqual([1, 2, 3]);
    expect(beats.map((b) => b.accent)).toEqual([true, false, false]);
    expect(nextIndex).toBe(3);
  });

  it("resumes from nextIndex without rescheduling or skipping beats", () => {
    const first = beatsInWindow(pulse, 0, 0.95, 1.6);
    const second = beatsInWindow(pulse, first.nextIndex, 1.55, 3.1);
    const all = [...first.beats, ...second.beats].map((b) => b.index);
    expect(all).toEqual([0, 1, 2, 3, 4]);
    expect(second.beats.find((b) => b.index === 4)?.accent).toBe(true);
  });

  it("returns nothing before the window reaches the next beat", () => {
    expect(beatsInWindow(pulse, 0, 0, 0.9)).toEqual({ beats: [], nextIndex: 0 });
  });

  it("derives times from the start, so they never drift", () => {
    const { beats } = beatsInWindow(pulse, 1000, 500, 501.2);
    expect(beats.map((b) => [b.index, b.time])).toEqual([[1000, 501]]);
  });

  it("skips beats that are already late instead of bunching them", () => {
    const { beats, nextIndex } = beatsInWindow(pulse, 0, 3.2, 3.6);
    expect(beats.map((b) => b.index)).toEqual([5]);
    expect(nextIndex).toBe(6);
  });

  it("marks count-in beats and stops a bounded run", () => {
    const countIn = createBeatRun({
      startTime: 0,
      bpm: 60,
      beatsPerBar: 3,
      countIn: true,
      continuous: false,
    });
    const { beats, nextIndex } = beatsInWindow(countIn, 0, 0, 100);
    expect(beats.map((b) => b.beat)).toEqual([1, 2, 3]);
    expect(beats.every((b) => b.countIn)).toBe(true);
    expect(nextIndex).toBe(3);
  });

  it("restarts bar numbering after the count-in when continuous", () => {
    const run = createBeatRun({
      startTime: 0,
      bpm: 60,
      beatsPerBar: 4,
      countIn: true,
      continuous: true,
    });
    const { beats } = beatsInWindow(run, 0, 0, 6);
    expect(beats.map((b) => [b.beat, b.countIn])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [1, false],
      [2, false],
    ]);
  });
});

describe("playedKey", () => {
  it("returns the key untouched without transposition", () => {
    expect(playedKey("Am")).toBe("Am");
    expect(playedKey("Bb", 0)).toBe("Bb");
  });

  it("transposes the key with the song", () => {
    expect(playedKey("G", 2)).toBe("A");
    expect(playedKey("Am", -2)).toBe("Gm");
    expect(playedKey("Bb", 1)).toBe("B");
  });

  it("ignores blank keys", () => {
    expect(playedKey(undefined, 3)).toBeUndefined();
    expect(playedKey("  ", 3)).toBeUndefined();
  });
});

describe("buildSongPreview", () => {
  it("collects transposed key, bpm and setup line", () => {
    expect(buildSongPreview({ key: "C", bpm: 128, transposition: 2 }, " 38B 🎙️🎹🎸 ")).toEqual({
      key: "D",
      bpm: 128,
      setup: "38B 🎙️🎹🎸",
    });
  });

  it("leaves out missing or unusable values", () => {
    expect(buildSongPreview({ bpm: 0 }, "")).toEqual({
      key: undefined,
      bpm: undefined,
      setup: undefined,
    });
  });

  describe("written key of a transposing part", () => {
    const writtenKey = (song: { key?: string; transposition?: number }, shift: number) =>
      buildSongPreview(song, undefined, shift).writtenKey;

    it("gives each pitch the key it reads, next to the concert key", () => {
      expect(buildSongPreview({ key: "Gm" }, undefined, partShift("trumpet"))).toMatchObject({
        key: "Gm",
        writtenKey: "Am",
      });
      expect(writtenKey({ key: "Gm" }, partShift("alto-sax"))).toBe("Em");
      expect(writtenKey({ key: "Gm" }, partShift("horn"))).toBe("Dm");
      expect(writtenKey({ key: "F" }, partShift("tenor-sax"))).toBe("G");
    });

    it("applies the song's transposition first", () => {
      expect(
        buildSongPreview({ key: "Gm", transposition: 2 }, undefined, partShift("trumpet")),
      ).toMatchObject({ key: "Am", writtenKey: "Bm" });
    });

    it("reads from the sounding key on capo charts", () => {
      // G shapes, capo 2: the band sounds A, a B♭ trumpet reads B
      expect(buildSongPreview({ key: "G" }, undefined, partShift("trumpet", 2))).toMatchObject({
        key: "G",
        writtenKey: "B",
      });
    });

    it("has none in concert pitch", () => {
      expect(writtenKey({ key: "Gm" }, partShift("guitar"))).toBeUndefined();
      expect(writtenKey({ key: "Gm" }, partShift("all"))).toBeUndefined();
      expect(writtenKey({ key: "Gm" }, partShift("trumpet", undefined, false))).toBeUndefined();
      expect(writtenKey({ key: "Gm" }, partShift("guitar", 3))).toBeUndefined();
    });

    it("has none when the key is missing or unreadable", () => {
      expect(writtenKey({}, partShift("trumpet"))).toBeUndefined();
      expect(writtenKey({ key: "Modal" }, partShift("trumpet"))).toBeUndefined();
    });
  });
});

describe("set breaks", () => {
  const set1 = { setIndex: 0, setName: "Set 1" };
  const set2 = { setIndex: 1, setName: "Encore" };

  it("detects a move into another set", () => {
    expect(isSetBreak(set1, set2)).toBe(true);
    expect(isSetBreak(set2, set1)).toBe(true);
  });

  it("ignores moves within a set and missing positions", () => {
    expect(isSetBreak(set1, { setIndex: 0, setName: "Set 1" })).toBe(false);
    expect(isSetBreak(undefined, set2)).toBe(false);
    expect(isSetBreak(set1, undefined)).toBe(false);
  });

  it("labels a set by name, or by number when unnamed", () => {
    const fallback = (n: number) => `Set ${n}`;
    expect(setLabel(set2, fallback)).toBe("Encore");
    expect(setLabel({ setIndex: 2, setName: "  " }, fallback)).toBe("Set 3");
  });
});
