/**
 * Minimal RFC 4180 CSV reader + byte decoding for exported spreadsheets.
 */

/**
 * Decode raw file bytes into a string.
 * Honors UTF-16LE / UTF-16BE / UTF-8 BOMs; defaults to UTF-8.
 * BOM-less UTF-16LE is detected by a NUL high byte in the first code unit.
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] !== 0 && bytes[1] === 0) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Parse CSV text into rows of fields.
 * Supports quoted fields with embedded commas, newlines (CRLF/LF/CR) and `""` escapes.
 * Blank lines are skipped. A leading BOM is ignored.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endRow = () => {
    row.push(field);
    field = "";
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r") {
      endRow();
      i += src[i + 1] === "\n" ? 2 : 1;
    } else if (ch === "\n") {
      endRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }

  if (field !== "" || row.length > 0) endRow();
  return rows;
}
