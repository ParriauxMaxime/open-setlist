import type { Setlist } from "@db";
import { useDb } from "@db/provider";
import { createId } from "@domain/id";
import { isoDay } from "@domain/setlist-order";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

/** Copies a saved setlist as "<name> (copy)", dated today, and opens the copy. */
export function useDuplicateSetlist(): (setlist: Setlist) => Promise<void> {
  const { t } = useTranslation();
  const db = useDb();

  return useCallback(
    async (setlist: Setlist) => {
      const id = createId();
      const now = Date.now();
      await db.setlists.put({
        ...setlist,
        id,
        name: t("setlist.copyName", { name: setlist.name }),
        date: isoDay(new Date()),
        sets: setlist.sets.map((s) => ({ ...s, songIds: [...s.songIds] })),
        createdAt: now,
        updatedAt: now,
      });
      Router.push("SetlistEdit", { setlistId: id });
    },
    [db, t],
  );
}
