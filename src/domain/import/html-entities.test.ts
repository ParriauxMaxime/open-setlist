import { decodeHtmlEntities } from "./html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes decimal and hex numeric entities", () => {
    expect(decodeHtmlEntities("Vari&#233;t&#233;")).toBe("Variété");
    expect(decodeHtmlEntities("Vari&#xE9;t&#Xe9;")).toBe("Variété");
    expect(decodeHtmlEntities("&#127928;")).toBe("🎸");
  });

  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("&amp; &lt; &gt; &quot; &#39; &apos;")).toBe(`& < > " ' '`);
  });

  it("decodes once, not recursively", () => {
    expect(decodeHtmlEntities("&amp;#233;")).toBe("&#233;");
  });

  it("keeps unknown, invalid and incomplete entities", () => {
    expect(decodeHtmlEntities("&foo; &#0; &#xD800; &#99999999; & ; &#233")).toBe(
      "&foo; &#0; &#xD800; &#99999999; & ; &#233",
    );
  });

  it("leaves plain text untouched", () => {
    expect(decodeHtmlEntities("Rock & Roll")).toBe("Rock & Roll");
  });
});
