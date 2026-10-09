import {
  type MyNotesMap,
  parseStoredMyNotes,
  readStoredMyNotes,
  subscribeMyNotes,
} from "@domain/my-notes";
import { useMemo, useSyncExternalStore } from "react";

/** The profile's private song notes, live (re-renders after any note is saved). */
export function useMyNotes(profileId: string): MyNotesMap {
  const raw = useSyncExternalStore(subscribeMyNotes, () => readStoredMyNotes(profileId));
  return useMemo(() => parseStoredMyNotes(raw), [raw]);
}
