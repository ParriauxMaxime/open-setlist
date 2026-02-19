import { z } from "zod";

const STORAGE_KEY_PREFIX = "open-setlist-sync-config";

function storageKey(profileId: string): string {
  return `${STORAGE_KEY_PREFIX}-${profileId}`;
}

const githubConfigSchema = z.object({
  adapter: z.literal("github"),
  owner: z.string().min(1),
  repo: z.string().min(1),
  token: z.string().min(1),
  path: z.string().min(1),
  lastVersionToken: z.string().nullable(),
  lastSyncedAt: z.number().nullable(),
});

const syncConfigSchema = z.discriminatedUnion("adapter", [githubConfigSchema]);

export type GitHubConfig = z.infer<typeof githubConfigSchema>;
export type SyncConfig = z.infer<typeof syncConfigSchema>;

export function loadSyncConfig(profileId: string): SyncConfig | null {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return null;
    return syncConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSyncConfig(profileId: string, config: SyncConfig): void {
  localStorage.setItem(storageKey(profileId), JSON.stringify(config));
}

export function clearSyncConfig(profileId: string): void {
  localStorage.removeItem(storageKey(profileId));
}

/** Migrate old un-keyed config to a profile-keyed one. Returns true if migration happened. */
export function migrateUnkeyedConfig(profileId: string): boolean {
  const OLD_KEY = "open-setlist-sync-config";
  const raw = localStorage.getItem(OLD_KEY);
  if (!raw) return false;
  localStorage.setItem(storageKey(profileId), raw);
  localStorage.removeItem(OLD_KEY);
  return true;
}
