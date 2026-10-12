/**
 * Order of the setlists list: the gig the band is about to play first.
 * Coming dates (today included) soonest first, then past ones latest first,
 * then undated setlists by last change.
 */

import type { Setlist } from "@db/setlist";

type Ordered = Pick<Setlist, "date" | "updatedAt">;

/** Local calendar day as `YYYY-MM-DD`, the format of `Setlist.date`. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function sortSetlistsForPlaying<T extends Ordered>(setlists: T[], today: string): T[] {
  const rank = (s: T) => (!s.date ? 2 : s.date >= today ? 0 : 1);
  return [...setlists].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.date && b.date && a.date !== b.date) {
      return rank(a) === 0 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    }
    return b.updatedAt - a.updatedAt;
  });
}

/** `2026-04-19` as a musician reads a date: "dim. 19 avr.", with the year when it is not this one. */
export function formatGigDate(isoDate: string, locale: string, today: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(isoDate.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(new Date(year, month - 1, day));
}
