/** Case and accents folded away for comparison: "Variété" and "VARIETE" both give "variete". */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function sameText(a: string, b: string): boolean {
  return foldText(a) === foldText(b);
}

export interface SpellingGroup {
  /** The most common spelling, the first one met on a tie. */
  preferred: string;
  /** Every spelling met, most common first. */
  spellings: { spelling: string; count: number }[];
}

/** Values grouped by spelling ("INDOCHINE", "Indochine"), sorted by preferred spelling. */
export function spellingGroups(values: Iterable<string>): SpellingGroup[] {
  const groups = new Map<string, Map<string, number>>();
  for (const value of values) {
    const folded = foldText(value);
    if (!folded) continue;
    const spellings = groups.get(folded) ?? new Map<string, number>();
    spellings.set(value, (spellings.get(value) ?? 0) + 1);
    groups.set(folded, spellings);
  }
  return [...groups.values()]
    .map((counts) => {
      const spellings = [...counts]
        .map(([spelling, count]) => ({ spelling, count }))
        .sort((a, b) => b.count - a.count);
      return { preferred: spellings[0]?.spelling ?? "", spellings };
    })
    .sort((a, b) => a.preferred.localeCompare(b.preferred, undefined, { sensitivity: "base" }));
}

/** One value per spelling group, in its most common spelling, sorted. */
export function groupSpellings(values: Iterable<string>): string[] {
  return spellingGroups(values).map((group) => group.preferred);
}
