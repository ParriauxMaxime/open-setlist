import {
  computeScrollStep,
  defaultScrollSpeed,
  isEditableTarget,
  keyToPerformAction,
  PerformAction,
  pxPerSecondToScrollSpeed,
  SCROLL_SPEED_DEFAULT,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
  scrollSpeedToPxPerSecond,
  stepScrollSpeed,
} from "./perform-stage";

describe("keyToPerformAction", () => {
  it.each([
    ["PageDown", PerformAction.Forward],
    ["ArrowDown", PerformAction.Forward],
    [" ", PerformAction.Forward],
    ["PageUp", PerformAction.Back],
    ["ArrowUp", PerformAction.Back],
    ["ArrowRight", PerformAction.NextSong],
    ["ArrowLeft", PerformAction.PrevSong],
    ["Escape", PerformAction.ToggleChrome],
    ["s", PerformAction.ToggleAutoScroll],
    ["S", PerformAction.ToggleAutoScroll],
  ])("maps %j to %s", (key, action) => {
    expect(keyToPerformAction({ key })).toBe(action);
  });

  it("maps Shift+Space to back", () => {
    expect(keyToPerformAction({ key: " ", shiftKey: true })).toBe(PerformAction.Back);
  });

  it("ignores unrelated keys", () => {
    expect(keyToPerformAction({ key: "a" })).toBeNull();
    expect(keyToPerformAction({ key: "Enter" })).toBeNull();
  });

  it("ignores keys with ctrl/meta/alt modifiers", () => {
    expect(keyToPerformAction({ key: "ArrowLeft", metaKey: true })).toBeNull();
    expect(keyToPerformAction({ key: "PageDown", ctrlKey: true })).toBeNull();
    expect(keyToPerformAction({ key: "s", altKey: true })).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("detects text fields and contenteditable", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("returns false for other elements", () => {
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget({ tagName: "BODY" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("computeScrollStep", () => {
  const view = { clientHeight: 1000, scrollHeight: 3000 };

  it("scrolls forward by a viewport minus overlap", () => {
    expect(computeScrollStep({ ...view, scrollTop: 0 }, "forward")).toEqual({
      type: "scroll",
      top: 850,
    });
  });

  it("clamps forward scroll to the bottom", () => {
    expect(computeScrollStep({ ...view, scrollTop: 1900 }, "forward")).toEqual({
      type: "scroll",
      top: 2000,
    });
  });

  it("changes song when forward at the bottom", () => {
    expect(computeScrollStep({ ...view, scrollTop: 2000 }, "forward")).toEqual({ type: "song" });
    // sub-pixel rounding
    expect(computeScrollStep({ ...view, scrollTop: 1999.5 }, "forward")).toEqual({
      type: "song",
    });
  });

  it("changes song when content fits the viewport", () => {
    const fits = { clientHeight: 1000, scrollHeight: 800, scrollTop: 0 };
    expect(computeScrollStep(fits, "forward")).toEqual({ type: "song" });
    expect(computeScrollStep(fits, "back")).toEqual({ type: "song" });
  });

  it("scrolls back and clamps at the top", () => {
    expect(computeScrollStep({ ...view, scrollTop: 2000 }, "back")).toEqual({
      type: "scroll",
      top: 1150,
    });
    expect(computeScrollStep({ ...view, scrollTop: 300 }, "back")).toEqual({
      type: "scroll",
      top: 0,
    });
  });

  it("changes song when back at the top", () => {
    expect(computeScrollStep({ ...view, scrollTop: 0 }, "back")).toEqual({ type: "song" });
  });
});

describe("scroll speed scale", () => {
  it("is monotonic and round-trips", () => {
    for (let level = SCROLL_SPEED_MIN; level < SCROLL_SPEED_MAX; level++) {
      expect(scrollSpeedToPxPerSecond(level + 1)).toBeGreaterThan(scrollSpeedToPxPerSecond(level));
      expect(pxPerSecondToScrollSpeed(scrollSpeedToPxPerSecond(level))).toBeCloseTo(level);
    }
  });

  it("clamps out-of-range values", () => {
    expect(pxPerSecondToScrollSpeed(0)).toBe(SCROLL_SPEED_MIN);
    expect(pxPerSecondToScrollSpeed(0.1)).toBe(SCROLL_SPEED_MIN);
    expect(pxPerSecondToScrollSpeed(10_000)).toBe(SCROLL_SPEED_MAX);
    expect(scrollSpeedToPxPerSecond(42)).toBe(scrollSpeedToPxPerSecond(SCROLL_SPEED_MAX));
  });
});

describe("defaultScrollSpeed", () => {
  it("falls back to the medium default without a duration", () => {
    expect(defaultScrollSpeed(undefined, 3000)).toBe(SCROLL_SPEED_DEFAULT);
    expect(defaultScrollSpeed(0, 3000)).toBe(SCROLL_SPEED_DEFAULT);
  });

  it("falls back when there is nothing to scroll", () => {
    expect(defaultScrollSpeed(200, 0)).toBe(SCROLL_SPEED_DEFAULT);
  });

  it("scrolls the content over the duration minus intro", () => {
    // 200s song → 30s intro (capped) → 170s of scrolling
    const level = defaultScrollSpeed(200, 3400);
    expect(scrollSpeedToPxPerSecond(level)).toBeCloseTo(3400 / 170);
  });

  it("uses a proportional intro for short songs", () => {
    // 100s song → 15s intro → 85s of scrolling
    const level = defaultScrollSpeed(100, 1700);
    expect(scrollSpeedToPxPerSecond(level)).toBeCloseTo(1700 / 85);
  });

  it("is slower for longer songs with the same content", () => {
    expect(defaultScrollSpeed(400, 3000)).toBeLessThan(defaultScrollSpeed(150, 3000));
  });
});

describe("stepScrollSpeed", () => {
  it("rounds a derived level then steps", () => {
    expect(stepScrollSpeed(4.6, 1)).toBe(6);
    expect(stepScrollSpeed(4.4, -1)).toBe(3);
  });

  it("clamps to 1–10", () => {
    expect(stepScrollSpeed(10, 1)).toBe(10);
    expect(stepScrollSpeed(1, -1)).toBe(1);
  });
});
