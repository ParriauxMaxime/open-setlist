import { NOTE_OPTIONS, searchNotes } from "./note-options";

describe("NOTE_OPTIONS", () => {
  it("lists the 128 MIDI notes with their Live names", () => {
    expect(NOTE_OPTIONS).toHaveLength(128);
    expect(NOTE_OPTIONS[0]).toEqual({ value: "0", note: "C-2" });
    expect(NOTE_OPTIONS[60]).toEqual({ value: "60", note: "C3" });
    expect(NOTE_OPTIONS[127]).toEqual({ value: "127", note: "G8" });
  });
});

describe("searchNotes", () => {
  it("matches numbers by their first digits", () => {
    expect(searchNotes("6").map((o) => o.value)).toEqual([
      "6",
      "60",
      "61",
      "62",
      "63",
      "64",
      "65",
      "66",
      "67",
      "68",
      "69",
    ]);
    expect(searchNotes("127").map((o) => o.value)).toEqual(["127"]);
  });

  it("matches note names as Live shows them, any case, sharps included", () => {
    expect(searchNotes("c3").map((o) => o.note)).toEqual(["C3"]);
    expect(searchNotes("C#").map((o) => o.note)).toEqual(
      ["C#-2", "C#-1", "C#0", "C#1", "C#2", "C#3", "C#4", "C#5", "C#6", "C#7", "C#8"].filter(
        (name) => NOTE_OPTIONS.some((o) => o.note === name),
      ),
    );
    expect(searchNotes("g8").map((o) => o.value)).toEqual(["127"]);
  });

  it("shows everything for an empty query and respects the limit", () => {
    expect(searchNotes("")).toHaveLength(128);
    expect(searchNotes("", 8)).toHaveLength(8);
    expect(searchNotes("x")).toEqual([]);
  });
});
