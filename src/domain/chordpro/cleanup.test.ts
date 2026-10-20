import { type CleanupSong, cleanupChart, needsCleanup } from "./cleanup";

const header = ["{title: 3 nuits par semaine}", "{artist: INDOCHINE}", "{key: Dm}", "{bpm: 120}"];
const body = [
  "{comment:17A🎸}",
  "{c:Verse 1}",
  "[Dm]Je parle [F]à demi-mot",
  "{soh}oh oh{eoh}",
  "{soc}",
  "{eoc}",
];

function song(lines: string[], fields: Partial<CleanupSong> = {}): CleanupSong {
  return { content: lines.join("\n"), tags: ["Rock"], ...fields };
}

const stored: Partial<CleanupSong> = {
  key: "Dm",
  bpm: 120,
  notes: "🎙️ Maëva + 🎹",
  links: { youtube: "https://youtu.be/x" },
  scrollSpeed: 6,
};

describe("cleanupChart", () => {
  it("drops the appended directives the song already stores", () => {
    const chart = song(
      [
        ...header,
        "",
        ...body,
        "{genre:Rock}",
        "{youtube:https://youtu.be/x}",
        "{notes:🎙️ Maëva + 🎹}",
        "{extra:scale:0,x:0,y:0,newscale:8}",
        "{tempo:120}",
        "{key:RÉm}",
        "{scrollspeed:6}",
      ],
      stored,
    );
    expect(cleanupChart(chart)).toBe([...header, "", ...body].join("\n"));
  });

  it("keeps an appended directive whose value the song does not store", () => {
    const chart = song([...header, "", ...body, "{genre:Variété}", "{tempo:98}", "{extra:x:0}"], {
      ...stored,
      scrollSpeed: undefined,
    });
    expect(cleanupChart(chart)).toBe(
      [...header, "", ...body, "{genre:Variété}", "{tempo:98}"].join("\n"),
    );
  });

  it("keeps scrollspeed while the song has no scroll speed", () => {
    const chart = song([...body, "{scrollspeed:6}"]);
    expect(cleanupChart(chart)).toBe(chart.content);
  });

  it("never touches the header of a chart without a body", () => {
    const chart = song(header, stored);
    expect(cleanupChart(chart)).toBe(chart.content);
  });

  it("only looks after the last line of the song", () => {
    const chart = song(["{extra:x:0}", ...body], stored);
    expect(cleanupChart(chart)).toBe(chart.content);
  });

  it("drops directives sharing one line only when all may go", () => {
    expect(cleanupChart(song([...body, "{tempo:120}{key:RÉm}"], stored))).toBe(body.join("\n"));
    expect(cleanupChart(song([...body, "{tempo:98}{key:RÉm}"], stored))).toBe(
      [...body, "{tempo:98}{key:RÉm}"].join("\n"),
    );
  });

  it("trims trailing spaces and collapses long blank runs", () => {
    const chart = song([
      "{soc}   \t",
      "[Eb]Moi, j'avais le soleil ",
      "  ",
      "",
      "",
      "",
      "[Bb]nuit",
      "",
      "",
    ]);
    expect(cleanupChart(chart)).toBe(
      ["{soc}", "[Eb]Moi, j'avais le soleil", "", "", "[Bb]nuit", ""].join("\n"),
    );
  });

  it("keeps a final newline", () => {
    expect(cleanupChart(song(["[C]la ", ""]))).toBe("[C]la\n");
  });

  it("leaves a clean chart as is", () => {
    const chart = song([...header, "", ...body], stored);
    expect(needsCleanup(chart)).toBe(false);
  });
});
