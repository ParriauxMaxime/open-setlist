/** Case and accents folded away for comparison: "Variété" and "VARIETE" both give "variete". */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function sameText(a: string, b: string): boolean {
  return foldText(a) === foldText(b);
}

/**
 * One value per spelling group ("INDOCHINE", "Indochine"), in its most common spelling
 * (the first one met on a tie), sorted.
 */
export function groupSpellings(values: Iterable<string>): string[] {
  const groups = new Map<string, Map<string, number>>();
  for (const value of values) {
    const folded = foldText(value);
    if (!folded) continue;
    const spellings = groups.get(folded) ?? new Map<string, number>();
    spellings.set(value, (spellings.get(value) ?? 0) + 1);
    groups.set(folded, spellings);
  }
  return [...groups.values()]
    .map((spellings) => {
      let best = "";
      let bestCount = 0;
      for (const [spelling, count] of spellings) {
        if (count > bestCount) {
          best = spelling;
          bestCount = count;
        }
      }
      return best;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
