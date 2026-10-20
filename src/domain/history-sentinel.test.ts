import { isSentinelState, sentinelState } from "./history-sentinel";

describe("history sentinel", () => {
  it("recognises its own state", () => {
    expect(isSentinelState(sentinelState())).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    ["openSetlistUnsaved"],
    [{}],
    [{ key: "abc" }],
  ])("ignores %p", (state) => {
    expect(isSentinelState(state)).toBe(false);
  });
});
