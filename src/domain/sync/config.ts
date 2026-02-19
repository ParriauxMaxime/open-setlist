import { z } from "zod";

const STORAGE_KEY = "open-setlist-sync-config";

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

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return syncConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearSyncConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
