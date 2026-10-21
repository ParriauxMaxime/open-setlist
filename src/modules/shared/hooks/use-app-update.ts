import { isAppUpdateReady, subscribeAppUpdate } from "@domain/pwa/sw-update";
import { useSyncExternalStore } from "react";

/** A new version of the app is installed and waits for a reload. */
export function useAppUpdateReady(): boolean {
  return useSyncExternalStore(subscribeAppUpdate, isAppUpdateReady);
}
