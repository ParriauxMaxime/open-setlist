# Sync Architecture

The hardest problem in Open Setlist. Getting this right is the whole game.

## The Constraint

- Musicians can't afford servers
- Gigs have no WiFi (LAN sync must work)
- But sometimes you DO have internet and want to sync remotely
- Sync must NEVER silently destroy data
- Multiple band members editing the same catalog

## Layered Sync: Three Tiers

```
Tier 1: LAN (fast, no internet)
  → rehearsal room, backstage, same house
  → direct device-to-device over local network

Tier 2: Git remote (free, versioned, async)
  → GitHub / GitLab private repo, free tier
  → persistent sync when you have internet
  → full version history for free

Tier 3: Cloud folder (alternative for non-git users)
  → Google Drive / Dropbox / OneDrive
  → user's own free account, no ours to maintain
```

Musicians pick what works for them. A solo player might only use Tier 1 (or nothing — just local files). A band that rehearses weekly might use Tier 1 + Tier 2. A remote collaboration uses Tier 2 or 3.

---

## Tier 1: LAN Sync

**When:** Rehearsal, backstage, same WiFi at home

**How it works:**
- One device announces itself on the local network (mDNS/Bonjour or simple broadcast)
- Other devices discover it automatically
- Devices exchange file lists and timestamps
- Changed files sync directly, device-to-device
- If both changed the same file → conflict shown to user, never auto-resolved

**Tech options:**
- PWA running a lightweight WebRTC data channel (peer-to-peer, browser-native)
- Or: one device acts as a tiny HTTP server others connect to (like AirDrop-style)

**Pros:** Fast, no internet needed, zero cost, zero accounts
**Cons:** Devices must be on same network at same time

---

## Tier 2: Git Remote (The Sweet Spot)

**Why git is perfect for this:**
The data is already plain text files — ChordPro songs and YAML setlists. Git was literally built to merge text files written by multiple people. It's free. It keeps history. It's the most battle-tested sync protocol on earth.

**How it works:**
- Band creates a GitHub/GitLab private repo (free, unlimited)
- Each member connects with a personal access token (or OAuth)
- The app does `pull → merge → commit → push` behind the scenes
- Musicians never see git. They see "Sync" button, green checkmark.
- On conflict: app shows both versions side by side, human picks

**What the musician experiences:**
```
1. Band leader taps "Create Band" → app creates a private GitHub repo
2. Shares an invite link to bandmates
3. Bandmates tap "Join Band" → enters link + authorizes GitHub
4. Everyone's catalog syncs automatically
5. Edit a song → push when on WiFi → everyone gets it next sync
6. Conflict? "Hey, you and Alex both edited 'Midnight Drive'. Which version?"
```

**Rate limits (GitHub):**
- Authenticated: [5,000 requests/hour](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — more than enough
- Free private repos: unlimited
- Storage: 1GB soft limit per repo (a band's entire catalog of text files is maybe 5MB)
- Git LFS for audio attachments if needed (1GB free)

**What makes this great:**
- **Free forever** — GitHub/GitLab aren't going anywhere
- **Version history for free** — "what did this song look like last month?" → just git log
- **Rollback** — sync went wrong? `git revert`. Data is never truly lost.
- **Branching** — experimental setlist for a special gig? Branch it.
- **Works with existing tools** — power users can use git CLI, VS Code, whatever
- **We host nothing** — zero server cost, zero maintenance, zero liability

**What to watch out for:**
- GitHub OAuth setup requires a registered OAuth app (one-time, free)
- Personal access tokens are simpler but less user-friendly
- Non-technical musicians might balk at "GitHub" — but they never need to see it
- Binary files (audio attachments) need Git LFS or a different solution

---

## Tier 3: Cloud Folder (Google Drive / Dropbox)

**For musicians who don't want GitHub.**

**How it works:**
- User connects their Google Drive / Dropbox account (OAuth)
- App creates an `open-setlist/` folder in their cloud storage
- Files sync through the cloud provider's infrastructure
- We just read/write files to the user's own storage

**Using [remoteStorage.js](https://remotestorage.io/):**
- Open protocol: "user brings their own storage"
- Built-in support for Google Drive + Dropbox as backends
- Handles offline caching + sync
- The app never touches a server — it talks directly to the user's storage

**Google Drive specifics:**
- [15GB free](https://developers.google.com/workspace/drive/api/guides/about-sdk) per account (more than enough)
- API is free with [rate limits](https://developers.google.com/workspace/drive/api/guides/limits) (~1000 reads, ~100 writes per 100 seconds)
- OAuth consent screen required (one-time setup)

**Pros:**
- Familiar to non-technical users ("just connect your Google Drive")
- No git concepts to explain
- Automatic cloud backup

**Cons:**
- Worse at merging than git (last-write-wins risk with some providers)
- OAuth is more complex to implement
- Cloud provider API changes could break things
- Shared band catalog is messier (shared Drive folder vs. git repo)

---

## Conflict Resolution (All Tiers)

**The golden rule: never silently overwrite.**

When two people edit the same file between syncs:

```
┌────────────────────────────────────────────┐
│  ⚠ Conflict: midnight-drive.chopro         │
│                                            │
│  You changed:        Alex changed:         │
│  ┌────────────┐      ┌────────────┐       │
│  │ Key: Am    │      │ Key: Bm    │       │
│  │ BPM: 124   │      │ BPM: 120   │       │
│  │ [Am]Down.. │      │ [Bm]Down.. │       │
│  └────────────┘      └────────────┘       │
│                                            │
│  [ Keep Mine ]  [ Keep Theirs ]  [ Both ]  │
└────────────────────────────────────────────┘
```

- Show what changed, not the whole file
- Let the human decide
- "Both" saves both versions (yours as `midnight-drive.chopro`, theirs as `midnight-drive.alex.chopro`)
- Unresolved conflicts block sync but never corrupt data

---

## Recommended Default

**Tier 2 (Git)** as the primary remote sync, with **Tier 1 (LAN)** for fast local sync.

Git is the natural fit: the data format is plain text, merging is git's superpower, it's free, and it gives us version history and rollback for free. The app abstracts away all git complexity — musicians just see a sync button.

Tier 3 (Cloud folder) as an alternative for bands that really can't do GitHub, but it's a secondary path.

---

## What Stays Local (Never Synced)

- **Theme / appearance config** — personal to each device and user. Your bassist likes green chords on black, your guitarist likes amber on dark blue. That's their business. Theme is stored locally, never pushed to the band repo. Users can manually share theme configs as JSON files if they want.

## What We Never Do

- **Run our own servers** — zero infra cost, zero maintenance, zero downtime risk
- **Store user data** — it lives on their device and their chosen remote (GitHub/Drive/etc)
- **Require accounts with us** — no sign-up, no email, no tracking
- **Auto-resolve conflicts** — humans decide, always
- **Require internet for core function** — everything works offline, sync is additive
