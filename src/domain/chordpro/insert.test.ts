import { applyChartInsert, ChartInsert, type TextSelection } from "./insert";

/** Writes the caret as `|` to read results at a glance. */
function withCaret({ text, start }: TextSelection) {
  return `${text.slice(0, start)}|${text.slice(start)}`;
}

function at(text: string, start: number, end = start): TextSelection {
  return { text, start, end };
}

describe("applyChartInsert", () => {
  it("inserts an empty verse in an empty chart, caret inside", () => {
    expect(withCaret(applyChartInsert(at("", 0), ChartInsert.Verse))).toBe(
      "{start_of_verse}\n|\n{end_of_verse}",
    );
  });

  it("puts an empty block on lines of its own", () => {
    const text = "[C]One\n[G]Two";
    expect(withCaret(applyChartInsert(at(text, 6), ChartInsert.Chorus))).toBe(
      "[C]One\n{start_of_chorus}\n|\n{end_of_chorus}\n[G]Two",
    );
  });

  it("wraps the whole lines of a selection", () => {
    const text = "{title: Song}\n[C]One\n[G]Two\nThree";
    const start = text.indexOf("ne");
    const end = text.indexOf("Two") + 1;
    const result = applyChartInsert(at(text, start, end), ChartInsert.Bridge);
    expect(withCaret(result)).toBe(
      "{title: Song}\n{start_of_bridge}\n[C]One\n[G]Two\n{end_of_bridge}|\nThree",
    );
  });

  it("keeps the line break that ends a selection outside the block", () => {
    const text = "One\nTwo\n";
    const result = applyChartInsert(at(text, 0, 4), ChartInsert.Verse);
    expect(result.text).toBe("{start_of_verse}\nOne\n{end_of_verse}\nTwo\n");
  });

  it("inserts a comment on its own line with the caret inside", () => {
    expect(withCaret(applyChartInsert(at("[C]One", 6), ChartInsert.Comment))).toBe(
      "[C]One\n{comment: |}",
    );
  });

  it("turns the selected text into the comment", () => {
    const result = applyChartInsert(at("Softly\nOne", 0, 6), ChartInsert.Comment);
    expect(withCaret(result)).toBe("{comment: Softly|}\nOne");
  });

  it("inserts a chord with the caret between the brackets", () => {
    expect(withCaret(applyChartInsert(at("Down the road", 5), ChartInsert.Chord))).toBe(
      "Down [|]the road",
    );
  });

  it("brackets the selected chord", () => {
    expect(withCaret(applyChartInsert(at("Am Down", 0, 2), ChartInsert.Chord))).toBe("[Am|] Down");
  });
});
