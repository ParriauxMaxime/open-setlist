import { formatGigDate, isoDay, sortSetlistsForPlaying } from "./setlist-order";

const TODAY = "2026-10-13";

function setlist(name: string, date: string | undefined, updatedAt = 0) {
  return { name, date, updatedAt };
}

describe("sortSetlistsForPlaying", () => {
  it("puts tonight's gig first, then the coming ones, then the past, then the undated", () => {
    const sorted = sortSetlistsForPlaying(
      [
        setlist("last spring", "2026-04-19"),
        setlist("draft", undefined, 5),
        setlist("next month", "2026-11-07"),
        setlist("last week", "2026-10-06"),
        setlist("tonight", TODAY),
        setlist("old draft", undefined, 1),
      ],
      TODAY,
    );
    expect(sorted.map((s) => s.name)).toEqual([
      "tonight",
      "next month",
      "last week",
      "last spring",
      "draft",
      "old draft",
    ]);
  });

  it("orders two setlists of the same day by last change, and leaves its input alone", () => {
    const input = [setlist("a", TODAY, 1), setlist("b", TODAY, 2)];
    expect(sortSetlistsForPlaying(input, TODAY).map((s) => s.name)).toEqual(["b", "a"]);
    expect(input.map((s) => s.name)).toEqual(["a", "b"]);
  });
});

describe("dates", () => {
  it("gives the local day in the setlist format", () => {
    expect(isoDay(new Date(2026, 9, 3, 23, 30))).toBe("2026-10-03");
  });

  it("writes a gig date the way a musician reads it", () => {
    expect(formatGigDate("2026-04-19", "fr", TODAY)).toBe("dim. 19 avr.");
    expect(formatGigDate("2026-04-19", "en", TODAY)).toBe("Sun, Apr 19");
    expect(formatGigDate("2027-01-02", "fr", TODAY)).toBe("sam. 2 janv. 2027");
  });

  it("leaves an unreadable date as it is", () => {
    expect(formatGigDate("someday", "fr", TODAY)).toBe("someday");
  });
});
