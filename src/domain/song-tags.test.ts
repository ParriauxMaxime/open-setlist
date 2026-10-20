import { addTag } from "./song-tags";

describe("addTag", () => {
  it("adds a new tag at the end", () => {
    expect(addTag(["rock"], " ballad ")).toEqual(["rock", "ballad"]);
  });

  it("leaves a song that has the tag in another spelling", () => {
    expect(addTag(["Variété"], "variete")).toBeNull();
  });

  it("adds nothing for an empty tag", () => {
    expect(addTag([], "  ")).toBeNull();
  });
});
