import { resolveTechNote, setTechNoteOverride } from "./tech-notes";

describe("resolveTechNote", () => {
  const song = { id: "s1", techNotes: "Acoustic DI, vocal reverb up" };

  it("takes the setlist's note over the song's", () => {
    expect(resolveTechNote({ techNotes: { s1: "Guest on vocals: mic 4" } }, song)).toBe(
      "Guest on vocals: mic 4",
    );
  });

  it("falls back to the song's note", () => {
    expect(resolveTechNote({}, song)).toBe("Acoustic DI, vocal reverb up");
    expect(resolveTechNote({ techNotes: { other: "x" } }, song)).toBe(
      "Acoustic DI, vocal reverb up",
    );
  });

  it("skips a blank override", () => {
    expect(resolveTechNote({ techNotes: { s1: "  " } }, song)).toBe("Acoustic DI, vocal reverb up");
  });

  it("is undefined when neither has a note", () => {
    expect(resolveTechNote({}, { id: "s1" })).toBeUndefined();
    expect(resolveTechNote({}, { id: "s1", techNotes: " \n" })).toBeUndefined();
  });

  it("trims the note", () => {
    expect(resolveTechNote({ techNotes: { s1: " Blue wash \n" } }, song)).toBe("Blue wash");
  });
});

describe("setTechNoteOverride", () => {
  it("adds a note", () => {
    expect(setTechNoteOverride({}, "s1", "Strobe in the bridge")).toEqual({
      s1: "Strobe in the bridge",
    });
  });

  it("replaces a note and keeps the others", () => {
    expect(setTechNoteOverride({ techNotes: { s1: "old", s2: "keep" } }, "s1", "new")).toEqual({
      s1: "new",
      s2: "keep",
    });
  });

  it("keeps the text as typed", () => {
    expect(setTechNoteOverride({}, "s1", "Fog ")).toEqual({ s1: "Fog " });
  });

  it("removes the note on blank text", () => {
    expect(setTechNoteOverride({ techNotes: { s1: "old", s2: "keep" } }, "s1", "  ")).toEqual({
      s2: "keep",
    });
  });

  it("is undefined once no note is left", () => {
    expect(setTechNoteOverride({ techNotes: { s1: "old" } }, "s1", "")).toBeUndefined();
    expect(setTechNoteOverride({}, "s1", "")).toBeUndefined();
  });

  it("does not change the record it was given", () => {
    const techNotes = { s1: "old" };
    setTechNoteOverride({ techNotes }, "s1", "new");
    expect(techNotes).toEqual({ s1: "old" });
  });
});
