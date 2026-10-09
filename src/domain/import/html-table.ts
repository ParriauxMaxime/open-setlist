import { decodeHtmlEntities } from "./html-entities";

export function looksLikeHtml(text: string): boolean {
  return /^\s*</.test(text);
}

/** Rows of the first HTML table (Setlist Helper "Html" export), cells as decoded plain text. */
export function parseHtmlTable(html: string): string[][] {
  const rows: string[][] = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(([, cell]) => {
      const text = decodeHtmlEntities(cell.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
      // ASP.NET grids render empty cells as &nbsp;
      return text.trim() === "" ? "" : text;
    });
    rows.push(cells);
  }
  return rows;
}
