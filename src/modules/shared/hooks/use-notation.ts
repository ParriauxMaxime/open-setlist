import type { Notation } from "@domain/chords/notation";
import { loadPreferences } from "@domain/preferences";
import { useState } from "react";

/** Device chord notation, read once per mount (a settings change applies on the next page). */
export function useNotation(): Notation {
  const [notation] = useState(() => loadPreferences().notation);
  return notation;
}
