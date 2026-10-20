import { sameText } from "./text";

/** Tags with `tag` added; null when the song already has it, whatever the spelling. */
export function addTag(tags: readonly string[], tag: string): string[] | null {
  const added = tag.trim();
  if (!added || tags.some((existing) => sameText(existing, added))) return null;
  return [...tags, added];
}
