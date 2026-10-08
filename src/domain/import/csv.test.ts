import { decodeTextBytes, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows with CRLF line endings", () => {
    expect(parseCsv("a,b,c\r\n1,2,3\r\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("accepts LF line endings and a missing trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c\r\n,,\r\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCsv('name,lyrics\r\nX,"one, two"\r\n')).toEqual([
      ["name", "lyrics"],
      ["X", "one, two"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\r\n"He said ""hi"""\r\n')).toEqual([["a"], ['He said "hi"']]);
  });

  it("keeps CRLF and LF newlines inside quoted fields", () => {
    const rows = parseCsv('a,b\r\n"line1\r\nline2\nline3",z\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["line1\r\nline2\nline3", "z"],
    ]);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("﻿Name,Key\r\nX,A\r\n")[0]).toEqual(["Name", "Key"]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a\r\n\r\nb\r\n")).toEqual([["a"], ["b"]]);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("decodeTextBytes", () => {
  const sample = 'Name,Lyrics\r\nÉté 🎸,"{t:Été}\r\n[Am]la"\r\n';

  it("decodes UTF-16LE with BOM", () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(sample, "utf16le")]);
    const text = decodeTextBytes(new Uint8Array(bytes));
    expect(text).toBe(sample);
    expect(parseCsv(text)[1]).toEqual(["Été 🎸", "{t:Été}\r\n[Am]la"]);
  });

  it("decodes BOM-less UTF-16LE", () => {
    const bytes = Buffer.from(sample, "utf16le");
    expect(decodeTextBytes(new Uint8Array(bytes))).toBe(sample);
  });

  it("decodes UTF-8 with BOM", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sample, "utf8")]);
    expect(decodeTextBytes(new Uint8Array(bytes))).toBe(sample);
  });

  it("decodes UTF-8 without BOM", () => {
    expect(decodeTextBytes(new Uint8Array(Buffer.from(sample, "utf8")))).toBe(sample);
  });
});
