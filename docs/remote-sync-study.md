# Remote Sync — Feasibility Study

## Context

Open Setlist currently syncs via JSON file export/import (download a file, send it to your bandmate, they import it). The `StorageAdapter` interface already exists:

```ts
interface StorageAdapter {
  pull(): Promise<Snapshot>;
  push(snapshot: Snapshot): Promise<void>;
  isConfigured(): boolean;
}
```

The snapshot is a flat JSON blob: `{ version, exportedAt, songs[], setlists[] }`. Both adapters below would implement this same interface — the UI and merge logic stay the same regardless of backend.

Two real-world use-cases emerged:
1. **Shared Google account** — the band has one Google account, everyone dumps stuff in Drive
2. **Git repository** — a private repo (GitHub/GitLab) holds the shared data

---

## Option A: Google Drive

### How it works

```
Band member opens PWA
  → "Connect Google Drive" button
  → Google sign-in popup (Google Identity Services)
  → Google Picker: "Select your band folder"
  → Folder ID saved locally
  → push/pull read/write a single setlist.json in that folder
```

All API calls go through `www.googleapis.com` which has full CORS support — no proxy needed, no backend needed.

### Auth flow

Google Identity Services (GIS) replaces the old `gapi.auth2`. It's a `<script>` loaded from Google's CDN (~80KB gzipped). The token model works like this:

1. Initialize a token client with your OAuth Client ID + `drive.file` scope
2. User clicks "Connect" → Google popup → consent → access token returned to JS callback
3. Token is valid for **1 hour**, then you call `requestAccessToken()` again (often silent if Google session is alive)

**No refresh tokens in the browser.** After 1 hour, the user may need to click "Reconnect" if their Google session expired.

### API surface (raw fetch, no gapi.client needed)

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List files in folder | `GET` | `/drive/v3/files?q='FOLDER_ID'+in+parents` |
| Read file content | `GET` | `/drive/v3/files/FILE_ID?alt=media` |
| Create file | `POST` | `/upload/drive/v3/files?uploadType=multipart` |
| Update file | `PATCH` | `/upload/drive/v3/files/FILE_ID?uploadType=multipart` |
| Get file metadata | `GET` | `/drive/v3/files/FILE_ID?fields=id,modifiedTime` |

Five endpoints, all CORS-enabled. No npm packages needed for the API itself.

### Shared account vs. shared folder

| | Shared account | Shared folder |
|---|---|---|
| Setup | Everyone logs in with same credentials | Leader creates folder, shares with members' emails |
| Identity | No per-member identity | Each member authenticated separately |
| Security | Password shared via Signal/WhatsApp | Each member has their own Google account |
| 2FA | Impractical (one phone) | Each member manages their own |
| Google ToS | Technically a violation | Fully compliant |
| Picker needed | No (app picks a known folder) | Yes (each member selects the shared folder once) |

**Recommendation:** Shared folder is cleaner. The Picker API lets users select the shared folder visually, and using `drive.file` scope means we only access files the user explicitly chose — keeps the OAuth scope non-restricted.

### The "unverified app" problem

Google requires app verification for the `drive.file` scope in production. Without it:
- **Testing mode:** Max 100 test users (added by email in Cloud Console). Consent expires every 7 days. Users see a scary "Google hasn't verified this app" warning.
- **Production with verification:** Requires a privacy policy URL, homepage, and Google review. Once verified, no user cap, no expiry warnings.

For a band of 3-8 people, Testing mode works but the **weekly re-consent** and **scary warning** are real UX friction.

### Config UX (what the user sees in Settings)

```
┌─ Sync ───────────────────────────────────┐
│                                          │
│  Google Drive                            │
│  ┌──────────────────────────────────┐    │
│  │ ✓ Connected as maxime@gmail.com  │    │
│  │   Folder: "Band Setlists"       │    │
│  │   [Change folder] [Disconnect]   │    │
│  └──────────────────────────────────┘    │
│                                          │
│  Auto-sync: on app load                  │
│                                          │
└──────────────────────────────────────────┘
```

First time: one "Connect Google Drive" button → Google popup → Picker → done.

### Pros

- **Familiar.** Everyone has a Google account. Non-technical people know Google Drive.
- **No config to share.** No tokens to copy-paste. Just sign in and pick a folder.
- **Visual.** The shared folder is visible in Drive — users can see the JSON file there.
- **Free.** 15GB free Drive storage. A setlist JSON is ~50KB.

### Cons

- **External scripts.** Must load `accounts.google.com/gsi/client` (~80KB) and optionally the Picker script. Not self-hostable.
- **1-hour token.** Access tokens expire. Silent refresh usually works, but sometimes the user gets a popup.
- **7-day consent in Testing mode.** Weekly re-auth friction unless you get verified.
- **Google Cloud Console setup.** Someone (the developer, not the band) needs to create an OAuth Client ID in the Google Cloud Console. Not hard, but it's a one-time dev task.
- **Verification overhead.** If you want to remove the "unverified app" warning, you need a privacy policy and Google review.
- **Conflict detection is weaker.** Drive's `modifiedTime` is the only signal — no content-level versioning like git's SHA.
- **No offline push.** If offline, changes queue locally but can't sync until online + authenticated.

### External dependencies

| What | Size | Source |
|------|------|--------|
| GIS script | ~80KB gz | `accounts.google.com/gsi/client` (CDN only) |
| Picker script | ~45KB gz | `apis.google.com/js/api.js` (CDN only, optional) |
| npm packages | 0 | Raw fetch for API calls |

Plus a Google Cloud Console project (free) with an OAuth Client ID.

---

## Option B: Git Repository (GitHub/GitLab Contents API)

### How it works

```
Band leader creates a private repo "band-setlists" on GitHub
  → Creates a fine-grained Personal Access Token scoped to that repo
  → Shares the token with band members (Signal, WhatsApp, etc.)
Each member opens PWA Settings
  → Pastes: owner/repo + token
  → Done. push/pull reads/writes setlist.json via GitHub's REST API.
```

All API calls go through `api.github.com` which has **full CORS support** (`Access-Control-Allow-Origin: *`). No proxy, no backend, no extra libraries.

### Why Contents API, not isomorphic-git

isomorphic-git is impressive (full git in the browser) but overkill here:
- Requires a CORS proxy (git protocol endpoints on github.com have no CORS headers)
- Requires LightningFS (IndexedDB-backed filesystem) to clone into
- Clones the entire repo into the browser
- ~50KB+ added bundle size

The GitHub Contents API gives us git-backed storage (every write = a commit, full history) using nothing but `fetch()`.

### API surface

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Read file | `GET` | `/repos/{owner}/{repo}/contents/{path}` |
| Create/update file | `PUT` | `/repos/{owner}/{repo}/contents/{path}` |
| Delete file | `DELETE` | `/repos/{owner}/{repo}/contents/{path}` |

Three endpoints. `GET` returns the file content (base64) plus its `sha`. `PUT` requires the current `sha` for updates — this is **built-in optimistic locking**.

```ts
// Read
const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/setlist.json`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { content, sha } = await res.json(); // content is base64

// Write (update)
await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/setlist.json`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Update setlist",
    content: btoa(JSON.stringify(snapshot, null, 2)),
    sha, // must match current — 409 if someone else pushed
  }),
});
```

### Auth: Fine-grained Personal Access Token

Created at github.com → Settings → Developer settings → Fine-grained tokens:
- Scoped to **one specific repository**
- Only needs **Contents: Read and write** permission
- Has a mandatory expiration date (max 1 year, but can be renewed)
- Passed as `Authorization: Bearer <token>` header

**No OAuth flow needed.** No popups, no consent screens, no external scripts. Just a token string.

**For non-technical members:** The token creation requires navigating GitHub's developer settings (5-7 clicks). The band leader could create a shared token and distribute it, or walk members through it once.

### What about OAuth?

GitHub's OAuth device flow (show a code, user enters it at github.com/login/device) would be nicer UX, but the OAuth endpoints on `github.com` **don't have CORS headers**. A browser `fetch()` to them is blocked. You'd need a small proxy — which we already have (Cloudflare Worker). So it's possible but adds complexity.

For a band of 3-8 people, a shared PAT is simpler.

### Conflict handling

The SHA-based locking is elegant:

1. Alice reads `setlist.json` (sha: `abc123`)
2. Bob reads `setlist.json` (sha: `abc123`)
3. Alice pushes update with sha `abc123` → succeeds (new sha: `def456`)
4. Bob pushes update with sha `abc123` → **409 Conflict**
5. Bob re-fetches (gets `def456`), merges, retries

For setlist data, the merge is straightforward:
- Songs and setlists have unique IDs
- Merge = union by ID, `updatedAt` timestamp wins for field conflicts
- Deletions can use tombstones or a simple "if it's in remote but not local AND local was modified after last sync, it was locally deleted"

### Config UX (what the user sees in Settings)

```
┌─ Sync ───────────────────────────────────┐
│                                          │
│  GitHub Repository                       │
│  ┌──────────────────────────────────┐    │
│  │ Repository:  [owner/repo       ] │    │
│  │ Token:       [ghp_•••••••••••••] │    │
│  │              [Test connection]    │    │
│  │ ✓ Connected — last sync: 2m ago  │    │
│  └──────────────────────────────────┘    │
│                                          │
│  Auto-sync: on app load                  │
│                                          │
└──────────────────────────────────────────┘
```

Two fields. Paste and go.

### GitLab support

GitLab's Repository Files API is nearly identical:
- `GET /api/v4/projects/:id/repository/files/:path?ref=main` (read)
- `PUT /api/v4/projects/:id/repository/files/:path` (write)
- Auth via `PRIVATE-TOKEN` header
- CORS support on `gitlab.com` API endpoints

Supporting both GitHub and GitLab means abstracting the three endpoints behind a small adapter. The data model is the same.

### Pros

- **Zero external scripts.** No Google CDN, no SDK. Just `fetch()`.
- **No token expiry headaches.** PAT is valid for up to a year (vs. 1 hour for Google).
- **Built-in versioning.** Every push is a git commit. Full history. Rollback possible.
- **SHA-based conflict detection.** Stronger than Drive's timestamp-based approach.
- **Offline-friendly.** Token doesn't expire while offline. Push when back online.
- **No consent screens.** No "unverified app" warnings. No weekly re-auth.
- **Portable.** Same pattern works for GitHub, GitLab, Gitea/Forgejo.
- **Free.** GitHub private repos are free. Unlimited collaborators.
- **Tiny implementation.** ~50 lines of adapter code.

### Cons

- **Requires a GitHub/GitLab account.** Not everyone has one. Non-technical people may find GitHub intimidating.
- **Token setup is fiddly.** Navigating developer settings to create a fine-grained PAT is ~7 clicks and not intuitive.
- **Token sharing is manual.** Band leader creates the repo, generates a token, sends it via chat. Not elegant.
- **No visual feedback.** The repo is invisible to non-technical members (they won't open github.com to look at it).
- **Token security.** Storing a PAT in IndexedDB/localStorage is vulnerable to XSS. But it's scoped to one repo with only content access, and the worst case is someone reads your setlists.

### External dependencies

| What | Size | Source |
|------|------|--------|
| npm packages | 0 | Raw fetch |
| External scripts | 0 | Nothing to load |
| Infrastructure | 0 | GitHub/GitLab free tier |

---

## Head-to-head comparison

| Aspect | Google Drive | Git (Contents API) |
|--------|-------------|-------------------|
| **Setup complexity (member)** | Sign in + pick folder (4-6 clicks) | Create PAT + paste 2 fields (7-10 clicks) |
| **Setup complexity (leader)** | Create Cloud Console project | Create repo + invite/share token |
| **Non-technical friendliness** | High (everyone knows Google) | Low-Medium (GitHub is intimidating) |
| **External scripts** | ~125KB from Google CDN | None |
| **npm dependencies** | None | None |
| **Token lifetime** | 1 hour (re-auth needed) | Up to 1 year |
| **Offline resilience** | Poor (token expires) | Good (token doesn't expire) |
| **Conflict detection** | Timestamp-based (weak) | SHA-based (strong) |
| **Version history** | One version (unless Drive versioning) | Full git history |
| **Consent/verification** | Scary warning or Google review | None |
| **CORS** | Full support | Full support |
| **Multi-platform** | Google only | GitHub, GitLab, Gitea |
| **Privacy** | Google sees your data | GitHub sees your data (or self-host Gitea) |
| **Implementation effort** | Medium (~150 LOC + GIS integration) | Small (~50 LOC) |
| **Backend needed** | No | No |

---

## Recommendation: Ship Git first, Drive later

### Why Git first

1. **Zero external dependencies.** No scripts to load, no SDK to wrangle, no consent screens. The adapter is ~50 lines of `fetch()` calls.
2. **Stronger sync semantics.** SHA-based conflict detection is objectively better than timestamp comparison.
3. **No token expiry dance.** A PAT lasts months. No silent re-auth, no "Reconnect" button, no 7-day consent cycle.
4. **Already have the infra.** The CORS proxy worker is already deployed for UG lookups. If we later want OAuth device flow, the worker can proxy those 2 endpoints too.
5. **Fastest to ship.** Implement the adapter, add 2 fields to Settings, done.

### Why Drive later

1. **Wider audience.** Google Drive is the answer for bands where nobody codes.
2. **Better onboarding UX.** "Sign in with Google" is universally understood.
3. **But it's more work.** GIS integration, Picker, token refresh logic, potential verification. Ship it as a second adapter once the sync infrastructure is battle-tested.

### Shared-token shortcut for bands

The most realistic band scenario for Git:
1. Leader creates a private repo and a fine-grained PAT scoped to it
2. Leader sends the repo name + token to the band group chat
3. Each member pastes both into the PWA Settings
4. Everyone shares the same token — functionally identical to the shared-Google-account model but with git versioning

This is the **"not a mess to config"** path. Two fields, one message in the group chat.

---

## Merge strategy (applies to both backends)

The snapshot is a flat `{ songs[], setlists[] }`. Both songs and setlists have `id` (UUID) and `updatedAt` (timestamp). Merge rules:

1. **New item** (exists in remote but not local, or vice versa): add it
2. **Both modified** (same `id` in both): keep the one with the later `updatedAt`
3. **Deleted locally, still in remote**: if local `lastSyncedAt` > remote item's `updatedAt`, it was intentionally deleted — remove from remote on next push. Otherwise, re-add locally.
4. **Deleted remotely, still local**: same logic in reverse

This is a simple last-writer-wins CRDT. No user-facing conflict resolution UI needed for v1. If two people edit the same song simultaneously, the last save wins — acceptable for a band's setlist.

### What changes in the snapshot format

Current snapshot has no sync metadata. We'd add:

```ts
interface Snapshot {
  version: 2; // bump
  exportedAt: number;
  songs: Song[];
  setlists: Setlist[];
  // New: track deletions for proper merge
  tombstones?: { type: "song" | "setlist"; id: string; deletedAt: number }[];
}
```

The tombstones let us distinguish "I deleted this" from "I never had this" during merge.

---

## Implementation sketch (Git adapter)

```ts
// src/domain/sync/adapters/github.ts

import type { Snapshot } from "@db/snapshot";
import type { StorageAdapter } from "../adapter";

interface GitHubConfig {
  owner: string;  // e.g. "my-band"
  repo: string;   // e.g. "setlists"
  token: string;  // fine-grained PAT
  path?: string;  // default: "setlist.json"
}

export function createGitHubAdapter(config: GitHubConfig): StorageAdapter {
  const { owner, repo, token, path = "setlist.json" } = config;
  const base = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let lastSha: string | null = null;

  return {
    name: "github",

    async pull(): Promise<Snapshot> {
      const res = await fetch(base, { headers });
      if (res.status === 404) throw new Error("File not found in repository");
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      const { content, sha } = await res.json();
      lastSha = sha;
      return JSON.parse(atob(content));
    },

    async push(snapshot: Snapshot): Promise<void> {
      // If we don't have the SHA yet, fetch it first
      if (!lastSha) {
        const res = await fetch(base, { headers });
        if (res.ok) {
          const { sha } = await res.json();
          lastSha = sha;
        }
      }

      const body: Record<string, string> = {
        message: `sync: ${new Date().toISOString()}`,
        content: btoa(JSON.stringify(snapshot, null, 2)),
      };
      if (lastSha) body.sha = lastSha;

      const res = await fetch(base, { method: "PUT", headers, body: JSON.stringify(body) });

      if (res.status === 409) {
        throw new Error("Conflict: someone else pushed. Pull first, then retry.");
      }
      if (!res.ok) throw new Error(`GitHub push failed: ${res.status}`);

      const { content: newContent } = await res.json();
      lastSha = newContent.sha;
    },

    isConfigured(): boolean {
      return Boolean(owner && repo && token);
    },
  };
}
```

~60 lines. No dependencies.
