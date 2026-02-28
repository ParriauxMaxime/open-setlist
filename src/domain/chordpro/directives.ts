/**
 * Pure utilities for reading/writing ChordPro directives in raw text.
 *
 * Used by the editor to sync metadata fields ↔ ChordPro content.
 */

const DIRECTIVE_LINE_RE = /^\{(\w+)(?::\s*(.*))?\}\s*$/;

/**
 * Set (or insert) a directive in raw ChordPro content.
 * If the directive already exists, its value is replaced.
 * If not, it is inserted after the last metadata directive block at the top.
 */
export function setDirective(content: string, name: string, value: string): string {
  const lines = content.split("\n");
  const lower = name.toLowerCase();

  // Find existing directive
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DIRECTIVE_LINE_RE);
    if (m && m[1].toLowerCase() === lower) {
      lines[i] = `{${name}: ${value}}`;
      return lines.join("\n");
    }
  }

  // Not found — insert after last metadata directive at the top
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DIRECTIVE_LINE_RE);
    if (m) {
      insertAt = i + 1;
    } else if (lines[i].trim() !== "") {
      break;
    }
  }

  lines.splice(insertAt, 0, `{${name}: ${value}}`);
  return lines.join("\n");
}

/**
 * Remove a directive line from raw ChordPro content.
 */
export function removeDirective(content: string, name: string): string {
  const lines = content.split("\n");
  const lower = name.toLowerCase();
  return lines
    .filter((line) => {
      const m = line.match(DIRECTIVE_LINE_RE);
      return !(m && m[1].toLowerCase() === lower);
    })
    .join("\n");
}

/**
 * Batch-update multiple directives in one pass.
 * Each entry is [name, value | undefined]. undefined removes the directive.
 */
export function setDirectives(
  content: string,
  patches: Array<[name: string, value: string | undefined]>,
): string {
  let result = content;
  for (const [name, value] of patches) {
    result =
      value !== undefined ? setDirective(result, name, value) : removeDirective(result, name);
  }
  return result;
}

/** Convert seconds → "M:SS" for ChordPro {duration} directive. */
export function durationToDirective(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Convert "M:SS" or raw number string → seconds. */
export function directiveToDuration(raw: string): number | undefined {
  return parseDuration(raw);
}

/** Convert string[] → comma-separated directive value. */
export function tagsToDirective(tags: string[]): string {
  return tags.join(", ");
}

/** Convert comma-separated directive value → string[]. */
export function directiveToTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Parse a duration string ("M:SS" or raw seconds) into seconds.
 * Extracted from seed.ts for reuse.
 */
export function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parts = raw.split(":");
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(raw) || undefined;
}
