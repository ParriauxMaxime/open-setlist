import { addProfile, loadProfiles, type Profile, setActiveProfileId } from "./profiles";
import { type GitHubConfig, type GoogleDriveConfig, saveSyncConfig } from "./sync/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvitePayload {
  profile: { name: string; avatar?: string };
  sync:
    | { adapter: "github"; owner: string; repo: string; token: string; path: string }
    | { adapter: "google-drive"; fileId: string };
}

// ---------------------------------------------------------------------------
// Encode / Decode
// ---------------------------------------------------------------------------

export function encodeInvite(payload: InvitePayload): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(json);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeInvite(encoded: string): InvitePayload | null {
  try {
    // Restore standard base64
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    // Add back padding
    while (b64.length % 4 !== 0) b64 += "=";
    const json = atob(b64);
    return JSON.parse(json) as InvitePayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function buildInviteUrl(payload: InvitePayload): string {
  const base = `${window.location.origin}${__BASE_PATH__}`;
  // Ensure no double slash before query string
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${cleanBase}?join=${encodeInvite(payload)}`;
}

export function extractInviteParam(): string | null {
  return new URLSearchParams(window.location.search).get("join");
}

export function clearInviteParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState(null, "", url.toString());
}

// ---------------------------------------------------------------------------
// Apply invite — creates or reuses profile + saves sync config
// ---------------------------------------------------------------------------

export function applyInvite(payload: InvitePayload): string {
  const profiles = loadProfiles();
  const existing = profiles.find((p) => p.name === payload.profile.name);

  let profileId: string;

  if (existing) {
    profileId = existing.id;
  } else {
    const newProfile: Profile = {
      id: crypto.randomUUID(),
      name: payload.profile.name,
      avatar: payload.profile.avatar,
      createdAt: Date.now(),
    };
    addProfile(newProfile);
    profileId = newProfile.id;
  }

  let syncConfig: GitHubConfig | GoogleDriveConfig;

  if (payload.sync.adapter === "github") {
    syncConfig = {
      adapter: "github",
      owner: payload.sync.owner,
      repo: payload.sync.repo,
      token: payload.sync.token,
      path: payload.sync.path,
      lastVersionToken: null,
      lastSyncedAt: null,
    };
  } else {
    syncConfig = {
      adapter: "google-drive",
      fileId: payload.sync.fileId,
      lastVersionToken: null,
      lastSyncedAt: null,
    };
  }

  saveSyncConfig(profileId, syncConfig);
  setActiveProfileId(profileId);

  return profileId;
}
