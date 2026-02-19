import { useActiveProfileId } from "@domain/profiles";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type AppDatabase, openProfileDb } from ".";

const DbContext = createContext<AppDatabase>(null as unknown as AppDatabase);

export function DbProvider({ children }: { children: ReactNode }) {
  const profileId = useActiveProfileId();
  const db = useMemo(() => openProfileDb(profileId), [profileId]);
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): AppDatabase {
  return useContext(DbContext);
}
