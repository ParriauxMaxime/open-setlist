/**
 * Tech notes for sound and light: each song carries its own, a setlist can replace it for one
 * gig (another venue, a guest on that song).
 */

import type { Setlist } from "@db/setlist";
import type { Song } from "@db/song";

export type TechNoteOverrides = Record<string, string>;

/** The setlist's note for the song if it has one, else the song's own; undefined when blank. */
export function resolveTechNote(
  setlist: Pick<Setlist, "techNotes">,
  song: Pick<Song, "id" | "techNotes">,
): string | undefined {
  return setlist.techNotes?.[song.id]?.trim() || song.techNotes?.trim() || undefined;
}

/** Overrides with the song's note set to `text`; a blank text removes it, none left → undefined. */
export function setTechNoteOverride(
  setlist: Pick<Setlist, "techNotes">,
  songId: string,
  text: string,
): TechNoteOverrides | undefined {
  const { [songId]: _, ...others } = setlist.techNotes ?? {};
  const next = text.trim() ? { ...others, [songId]: text } : others;
  return Object.keys(next).length > 0 ? next : undefined;
}
