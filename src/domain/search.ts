/**
 * Fuzzy search — multi-word substring matching.
 *
 * Splits query into words, checks that every word appears as a substring
 * somewhere in the target string. Case insensitive. Order independent.
 *
 * "john may" matches "John Mayer", "Mayer, John", etc.
 */
export function fuzzyMatch(target: string, query: string): boolean {
  const t = target.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => t.includes(w));
}

/**
 * Fuzzy match across multiple fields.
 * Returns true if all query words appear in at least one of the fields.
 */
export function fuzzyMatchAny(fields: (string | undefined | null)[], query: string): boolean {
  const combined = fields.filter(Boolean).join(" ");
  return fuzzyMatch(combined, query);
}
