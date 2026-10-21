import type { SetlistSet } from "@db";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/** The name of the first set each song of the setlist is in ("Set 2" when unnamed). */
export function useSongSetNames(
  sets: readonly Pick<SetlistSet, "name" | "songIds">[],
): ReadonlyMap<string, string> {
  const { t } = useTranslation();
  return useMemo(() => {
    const names = new Map<string, string>();
    sets.forEach((set, i) => {
      for (const id of set.songIds) {
        if (!names.has(id)) names.set(id, set.name || `${t("setlist.set")} ${i + 1}`);
      }
    });
    return names;
  }, [sets, t]);
}
