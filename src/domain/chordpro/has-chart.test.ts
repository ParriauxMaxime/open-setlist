import { hasChart } from "./has-chart";
import { parse } from "./parser";

describe("hasChart", () => {
  it("is false for metadata-only content", () => {
    expect(hasChart(parse("{title: Song}\n{artist: Band}\n{key: A}\n{bpm: 120}"))).toBe(false);
    expect(hasChart(parse(""))).toBe(false);
  });

  it("is true for lyrics, chord-only lines or a setup line", () => {
    expect(hasChart(parse("{title: Song}\n[Am]La la"))).toBe(true);
    expect(hasChart(parse("[A] [A]"))).toBe(true);
    expect(hasChart(parse("{title: Song}\n{comment: 37C 🎹}"))).toBe(true);
  });
});
