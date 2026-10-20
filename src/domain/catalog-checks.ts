/** Checks over the whole catalog, where one song alone cannot tell what is wrong. */

import type { Song } from "@db/song";
import { foldText, type SpellingGroup, spellingGroups } from "./text";

export const SPELLING_FIELD = {
  artist: "artist",
  tag: "tag",
} as const;

export type SpellingField = (typeof SPELLING_FIELD)[keyof typeof SPELLING_FIELD];

export const SPELLING_FIELD_LIST = Object.values(SPELLING_FIELD);

/** One name written several ways across the catalog ("Indochine" / "INDOCHINE"). */
export interface SpellingIssue extends SpellingGroup {
  field: SpellingField;
  /** Songs written another way than the preferred spelling. */
  songIds: string[];
}

type SpellingSong = Pick<Song, "id" | "artist" | "tags">;

function valuesOf(song: SpellingSong, field: SpellingField): string[] {
  if (field === SPELLING_FIELD.artist) return song.artist ? [song.artist] : [];
  return song.tags;
}

export function findSpellingIssues(songs: readonly SpellingSong[]): SpellingIssue[] {
  return SPELLING_FIELD_LIST.flatMap((field) =>
    spellingGroups(songs.flatMap((song) => valuesOf(song, field)))
      .filter((group) => group.spellings.length > 1)
      .map((group) => {
        const folded = foldText(group.preferred);
        const songIds = songs
          .filter((song) =>
            valuesOf(song, field).some(
              (value) => value !== group.preferred && foldText(value) === folded,
            ),
          )
          .map((song) => song.id);
        return { ...group, field, songIds };
      }),
  );
}

/** The fields to write so the song uses the preferred spelling; null when it already does. */
export function unifySpelling(
  song: SpellingSong,
  issue: Pick<SpellingIssue, "field" | "preferred">,
): Pick<Song, "artist"> | Pick<Song, "tags"> | null {
  const folded = foldText(issue.preferred);
  const isVariant = (value: string) => value !== issue.preferred && foldText(value) === folded;

  if (issue.field === SPELLING_FIELD.artist) {
    return song.artist && isVariant(song.artist) ? { artist: issue.preferred } : null;
  }
  if (!song.tags.some(isVariant)) return null;
  const tags = song.tags.map((tag) => (isVariant(tag) ? issue.preferred : tag));
  return { tags: [...new Set(tags)] };
}
