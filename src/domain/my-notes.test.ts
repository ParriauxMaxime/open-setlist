import { exportSnapshot } from "@db/snapshot";
import {
  clearMyNotes,
  getMyNote,
  loadMyNotes,
  MY_NOTE_MAX_LENGTH,
  mergeMyNotes,
  myNotesStorageKey,
  normalizeNoteText,
  parseMyNotes,
  parseStoredMyNotes,
  removeMyNote,
  setMyNote,
  subscribeMyNotes,
  withMyNote,
} from "./my-notes";
import { createMemoryDb, installMemoryLocalStorage } from "./sync/test-fakes";

beforeEach(() => {
  installMemoryLocalStorage();
});

describe("normalizeNoteText", () => {
  it("trims and unifies line endings", () => {
    expect(normalizeNoteText("  capo 2\r\nwatch the singer\r  ")).toBe("capo 2\nwatch the singer");
  });

  it("caps the length", () => {
    expect(normalizeNoteText("x".repeat(MY_NOTE_MAX_LENGTH + 10))).toHaveLength(MY_NOTE_MAX_LENGTH);
  });
});

describe("withMyNote", () => {
  it("sets a note without mutating the input", () => {
    const before = {};
    const after = withMyNote(before, "s1", " capo 2 ", 42);
    expect(after).toEqual({ s1: { text: "capo 2", updatedAt: 42 } });
    expect(before).toEqual({});
  });

  it("removes the note when the text is blank", () => {
    const notes = { s1: { text: "capo 2", updatedAt: 1 }, s2: { text: "12-string", updatedAt: 1 } };
    expect(withMyNote(notes, "s1", "  \n ")).toEqual({ s2: notes.s2 });
  });
});

describe("parseMyNotes", () => {
  it("keeps well-formed notes", () => {
    expect(parseMyNotes({ s1: { text: "capo 2", updatedAt: 5 } })).toEqual({
      s1: { text: "capo 2", updatedAt: 5 },
    });
  });

  it("drops malformed or blank entries and defaults a missing date", () => {
    expect(
      parseMyNotes({
        s1: { text: "ok" },
        s2: { text: "   " },
        s3: { text: 12 },
        s4: "capo 2",
        s5: null,
      }),
    ).toEqual({ s1: { text: "ok", updatedAt: 0 } });
  });

  it("rejects non-objects and prototype keys", () => {
    expect(parseMyNotes(null)).toEqual({});
    expect(parseMyNotes([{ text: "x", updatedAt: 1 }])).toEqual({});
    expect(parseMyNotes("capo")).toEqual({});
    const parsed = parseMyNotes(JSON.parse('{"__proto__": {"text": "x", "updatedAt": 1}}'));
    expect(Object.keys(parsed)).toEqual([]);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });

  it("survives corrupt storage", () => {
    expect(parseStoredMyNotes("{not json")).toEqual({});
    expect(parseStoredMyNotes(null)).toEqual({});
  });
});

describe("mergeMyNotes", () => {
  it("unions both sets and keeps the most recent note per song", () => {
    const current = {
      a: { text: "mine, newer", updatedAt: 10 },
      b: { text: "mine, older", updatedAt: 1 },
    };
    const incoming = {
      a: { text: "imported, older", updatedAt: 5 },
      b: { text: "imported, newer", updatedAt: 7 },
      c: { text: "imported only", updatedAt: 3 },
    };
    expect(mergeMyNotes(current, incoming)).toEqual({
      a: current.a,
      b: incoming.b,
      c: incoming.c,
    });
  });
});

describe("storage", () => {
  it("round-trips a note and deletes it when cleared", () => {
    setMyNote("p1", "s1", "capo 2");
    expect(getMyNote("p1", "s1")).toBe("capo 2");
    setMyNote("p1", "s1", "");
    expect(getMyNote("p1", "s1")).toBe("");
    // Nothing left: the storage key itself is removed
    expect(localStorage.getItem(myNotesStorageKey("p1"))).toBeNull();
  });

  it("keeps each profile's notes apart", () => {
    setMyNote("p1", "s1", "capo 2");
    setMyNote("p2", "s1", "use the 12-string");
    expect(getMyNote("p1", "s1")).toBe("capo 2");
    expect(getMyNote("p2", "s1")).toBe("use the 12-string");
    clearMyNotes("p1");
    expect(loadMyNotes("p1")).toEqual({});
    expect(getMyNote("p2", "s1")).toBe("use the 12-string");
  });

  it("removes a single note", () => {
    setMyNote("p1", "s1", "capo 2");
    setMyNote("p1", "s2", "watch the singer");
    removeMyNote("p1", "s1");
    removeMyNote("p1", "toString");
    expect(Object.keys(loadMyNotes("p1"))).toEqual(["s2"]);
  });

  it("notifies subscribers on every write", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeMyNotes(listener);
    setMyNote("p1", "s1", "capo 2");
    removeMyNote("p1", "s1");
    clearMyNotes("p1");
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    setMyNote("p1", "s1", "capo 2");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("never ends up in a sync snapshot", async () => {
    const db = createMemoryDb();
    setMyNote("p1", "s1", "capo 2");
    const snapshot = await exportSnapshot(db, "p1");
    expect(JSON.stringify(snapshot)).not.toContain("capo 2");
  });
});
