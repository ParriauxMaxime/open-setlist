import { setlistDuration } from "./setlist-duration";

describe("setlistDuration", () => {
  const songs = [{ id: "a", duration: 200 }, { id: "b" }, undefined, { id: "c", duration: 100 }];

  it("adds the known lengths and counts the others", () => {
    expect(setlistDuration(["a", "b", "c"], songs)).toEqual({ total: 300, unknownCount: 1 });
  });

  it("counts a song played twice twice", () => {
    expect(setlistDuration(["a", "a"], songs)).toEqual({ total: 400, unknownCount: 0 });
  });

  it("counts a missing song as without length", () => {
    expect(setlistDuration(["gone"], songs)).toEqual({ total: 0, unknownCount: 1 });
  });

  it("is empty for no songs", () => {
    expect(setlistDuration([], songs)).toEqual({ total: 0, unknownCount: 0 });
  });
});
