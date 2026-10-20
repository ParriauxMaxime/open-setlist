import { findSpellingIssues, SPELLING_FIELD, unifySpelling } from "./catalog-checks";

const songs = [
  { id: "1", artist: "Indochine", tags: ["Variété", "rock"] },
  { id: "2", artist: "INDOCHINE", tags: ["Variete"] },
  { id: "3", artist: "Indochine", tags: ["Variété"] },
  { id: "4", artist: "Téléphone", tags: ["rock"] },
  { id: "5", tags: [] },
];

describe("findSpellingIssues", () => {
  it("lists artists and tags written several ways, with the songs to rewrite", () => {
    expect(findSpellingIssues(songs)).toEqual([
      {
        field: SPELLING_FIELD.artist,
        preferred: "Indochine",
        spellings: [
          { spelling: "Indochine", count: 2 },
          { spelling: "INDOCHINE", count: 1 },
        ],
        songIds: ["2"],
      },
      {
        field: SPELLING_FIELD.tag,
        preferred: "Variété",
        spellings: [
          { spelling: "Variété", count: 2 },
          { spelling: "Variete", count: 1 },
        ],
        songIds: ["2"],
      },
    ]);
  });

  it("finds nothing when every name has one spelling", () => {
    expect(findSpellingIssues([songs[0], songs[3]])).toEqual([]);
  });
});

describe("unifySpelling", () => {
  it("rewrites the artist", () => {
    expect(
      unifySpelling(songs[1], { field: SPELLING_FIELD.artist, preferred: "Indochine" }),
    ).toEqual({ artist: "Indochine" });
  });

  it("rewrites the tag in place and drops the duplicate", () => {
    expect(
      unifySpelling(
        { id: "x", tags: ["live", "variete", "Variété"] },
        { field: SPELLING_FIELD.tag, preferred: "Variété" },
      ),
    ).toEqual({ tags: ["live", "Variété"] });
  });

  it("leaves a song already spelled the preferred way", () => {
    expect(unifySpelling(songs[0], { field: SPELLING_FIELD.artist, preferred: "Indochine" })).toBe(
      null,
    );
    expect(unifySpelling(songs[3], { field: SPELLING_FIELD.tag, preferred: "Variété" })).toBe(null);
  });
});
