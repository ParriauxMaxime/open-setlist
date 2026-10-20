import { useCallback, useState } from "react";

/** A yes/no choice remembered on this device, such as a panel left open. */
export function useStoredFlag(key: string, initial = false): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? initial : stored === "1";
  });
  const update = useCallback(
    (next: boolean) => {
      localStorage.setItem(key, next ? "1" : "0");
      setValue(next);
    },
    [key],
  );
  return [value, update];
}
