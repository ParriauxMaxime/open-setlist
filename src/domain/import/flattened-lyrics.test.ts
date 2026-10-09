import { restoreLineBreaks } from "./flattened-lyrics";

describe("restoreLineBreaks (Setlist Helper CSV flattens each newline to two spaces)", () => {
  it("turns each pair of spaces back into a newline", () => {
    expect(restoreLineBreaks("{t:Song}  {st:Band}  [A]la la")).toBe(
      "{t:Song}\n{st:Band}\n[A]la la",
    );
  });

  it("restores blank lines and keeps trailing spaces before a break", () => {
    expect(restoreLineBreaks("{comment:37C}    [Intro :]   [A] [A]")).toBe(
      "{comment:37C}\n\n[Intro :] \n[A] [A]",
    );
  });

  it("keeps single spaces", () => {
    expect(restoreLineBreaks("Est-ce que [A]tu vois")).toBe("Est-ce que [A]tu vois");
  });

  it("leaves text that already has line breaks untouched", () => {
    const text = "{t:Song}\r\n[A]la  la";
    expect(restoreLineBreaks(text)).toBe(text);
  });
});
