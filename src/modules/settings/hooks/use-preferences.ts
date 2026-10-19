import {
  type AppPreferences,
  applyPreferences,
  loadPreferences,
  savePreferences,
} from "@domain/preferences";
import { useCallback, useState } from "react";

/** Preferences as shown on the settings pages: every change is saved and applied at once. */
export function usePreferences() {
  const [prefs, setPrefs] = useState(loadPreferences);

  const update = useCallback((patch: Partial<AppPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      applyPreferences(next);
      return next;
    });
  }, []);

  const replace = useCallback((next: AppPreferences) => {
    savePreferences(next);
    applyPreferences(next);
    setPrefs(next);
  }, []);

  return { prefs, update, replace };
}
