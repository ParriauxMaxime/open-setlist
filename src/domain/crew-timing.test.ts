import { estimatedEnd, remainingSeconds, unknownRemaining } from "./crew-timing";

describe("remainingSeconds", () => {
  const durations = [200, 180, 240];

  it("counts the whole setlist before the first song started", () => {
    expect(remainingSeconds({ durations, currentIndex: 0, elapsedSeconds: 0 })).toBe(620);
  });

  it("takes off the time spent in the current song", () => {
    expect(remainingSeconds({ durations, currentIndex: 1, elapsedSeconds: 60 })).toBe(120 + 240);
  });

  it("never counts a song that ran long as negative", () => {
    expect(remainingSeconds({ durations, currentIndex: 1, elapsedSeconds: 500 })).toBe(240);
  });

  it("is 0 at the end of the last song", () => {
    expect(remainingSeconds({ durations, currentIndex: 2, elapsedSeconds: 240 })).toBe(0);
  });

  it("leaves out songs without a length", () => {
    expect(
      remainingSeconds({
        durations: [200, undefined, 240],
        currentIndex: 0,
        elapsedSeconds: 20,
      }),
    ).toBe(180 + 240);
    expect(
      remainingSeconds({ durations: [undefined, 100], currentIndex: 0, elapsedSeconds: 50 }),
    ).toBe(100);
  });

  it("is 0 outside the setlist", () => {
    expect(remainingSeconds({ durations, currentIndex: 3, elapsedSeconds: 0 })).toBe(0);
    expect(remainingSeconds({ durations: [], currentIndex: 0, elapsedSeconds: 0 })).toBe(0);
  });
});

describe("unknownRemaining", () => {
  it("counts the songs without a length from the current one on", () => {
    const durations = [undefined, 200, undefined, 0, 180];
    expect(unknownRemaining(durations, 0)).toBe(3);
    expect(unknownRemaining(durations, 1)).toBe(2);
    expect(unknownRemaining(durations, 4)).toBe(0);
  });
});

describe("estimatedEnd", () => {
  it("adds the remaining time to now", () => {
    const now = new Date(2026, 9, 21, 22, 24, 0).getTime();
    const end = estimatedEnd(now, 23 * 60);
    expect(end.getHours()).toBe(22);
    expect(end.getMinutes()).toBe(47);
  });
});
