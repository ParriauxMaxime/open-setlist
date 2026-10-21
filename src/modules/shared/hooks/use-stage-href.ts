import { isCrewPart } from "@domain/parts";
import { loadPreferences, resolvePartView } from "@domain/preferences";
import { useCallback, useState } from "react";
import { Router } from "../../../router";

/** Where ▶ on a setlist goes: the crew view on a Régie device, the charts otherwise. */
export function useStageHref(): (setlistId: string, start?: number) => string {
  const [crew] = useState(() => isCrewPart(resolvePartView(loadPreferences()).instrument));

  return useCallback(
    (setlistId: string, start?: number) => {
      const href = crew ? Router.Crew({ setlistId }) : Router.Perform({ setlistId });
      return start === undefined ? href : `${href}?start=${start}`;
    },
    [crew],
  );
}
