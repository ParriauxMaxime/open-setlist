import { createId } from "@domain/id";
import { z } from "zod";
import { MIN_PASSPHRASE_LENGTH, normalizePassphrase } from "./invite-passphrase";
import { addProfile, loadProfiles, type Profile, setActiveProfileId } from "./profiles";
import { type GitHubConfig, type GoogleDriveConfig, saveSyncConfig } from "./sync/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const invitePayloadSchema = z.object({
  profile: z.object({ name: z.string().min(1), avatar: z.string().optional() }),
  sync: z.discriminatedUnion("adapter", [
    z.object({
      adapter: z.literal("github"),
      owner: z.string().min(1),
      repo: z.string().min(1),
      path: z.string().min(1),
      // Absent in token-less invites: each member pastes their own token.
      token: z.string().min(1).optional(),
    }),
    z.object({ adapter: z.literal("google-drive"), fileId: z.string().min(1) }),
  ]),
});

export type InvitePayload = z.infer<typeof invitePayloadSchema>;

/** How a GitHub invite shares access with members. */
export const INVITE_PROTECTION = {
  passphrase: "passphrase",
  ownToken: "own-token",
} as const;
export type InviteProtection = (typeof INVITE_PROTECTION)[keyof typeof INVITE_PROTECTION];
export const INVITE_PROTECTIONS = Object.values(INVITE_PROTECTION);

export const GITHUB_TOKEN_DOCS_URL =
  "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token";

/**
 * Result of reading a `?join=` value:
 * - `encrypted`: needs the passphrase (`openSealedInvite`).
 * - `open`: no secret inside (token-less GitHub or Google Drive).
 * - `legacy`: pre-encryption link, may carry a plaintext token.
 */
export type ParsedInvite =
  | { kind: "encrypted"; sealed: string }
  | { kind: "open"; payload: InvitePayload }
  | { kind: "legacy"; payload: InvitePayload };

export class InvitePassphraseError extends Error {
  constructor() {
    super("Wrong passphrase or damaged invite link");
    this.name = "InvitePassphraseError";
  }
}

// ---------------------------------------------------------------------------
// Link format
//   e1.<salt>.<iv>.<ciphertext>  AES-256-GCM, key = PBKDF2-SHA256(passphrase)
//   o1.<json>                    no secret inside
//   <json>                       legacy, plaintext (may contain a token)
// All parts base64url without padding. Legacy links never contain ".".
// ---------------------------------------------------------------------------

const ENCRYPTED_PREFIX = "e1";
const OPEN_PREFIX = "o1";

export const INVITE_KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("Invalid base64url");
  let b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function parsePayload(json: string): InvitePayload | null {
  try {
    const result = invitePayloadSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function stripToken(payload: InvitePayload): InvitePayload {
  if (payload.sync.adapter !== "github") return payload;
  const { token: _token, ...sync } = payload.sync;
  return { ...payload, sync };
}

/** Invite without any secret: token-less GitHub, or Google Drive. */
export function encodeOpenInvite(payload: InvitePayload): string {
  const json = JSON.stringify(stripToken(payload));
  return `${OPEN_PREFIX}.${toBase64Url(new TextEncoder().encode(json))}`;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizePassphrase(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: INVITE_KDF_ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts the whole payload (token included) with a passphrase. */
export async function sealInvite(payload: InvitePayload, passphrase: string): Promise<string> {
  if (normalizePassphrase(passphrase).length < MIN_PASSPHRASE_LENGTH) {
    throw new Error("Passphrase too short");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(ENCRYPTED_PREFIX) },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const parts = [salt, iv, new Uint8Array(ciphertext)].map(toBase64Url);
  return [ENCRYPTED_PREFIX, ...parts].join(".");
}

/** Throws `InvitePassphraseError` on a wrong passphrase or a tampered link. */
export async function openSealedInvite(sealed: string, passphrase: string): Promise<InvitePayload> {
  const [prefix, saltPart, ivPart, cipherPart, ...rest] = sealed.split(".");
  if (prefix !== ENCRYPTED_PREFIX || !saltPart || !ivPart || !cipherPart || rest.length > 0) {
    throw new InvitePassphraseError();
  }
  let plaintext: ArrayBuffer;
  try {
    const salt = fromBase64Url(saltPart);
    const iv = fromBase64Url(ivPart);
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) throw new Error("Bad header");
    const key = await deriveKey(passphrase, salt);
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(ENCRYPTED_PREFIX) },
      key,
      fromBase64Url(cipherPart),
    );
  } catch {
    throw new InvitePassphraseError();
  }
  const payload = parsePayload(new TextDecoder().decode(plaintext));
  if (!payload) throw new InvitePassphraseError();
  return payload;
}

export function parseInvite(encoded: string): ParsedInvite | null {
  const dot = encoded.indexOf(".");
  if (dot === -1) {
    // Legacy: btoa(JSON) of a Latin-1 string, so decode with atob, not UTF-8.
    try {
      let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4 !== 0) b64 += "=";
      const payload = parsePayload(atob(b64));
      return payload ? { kind: "legacy", payload } : null;
    } catch {
      return null;
    }
  }

  const prefix = encoded.slice(0, dot);
  if (prefix === ENCRYPTED_PREFIX) {
    return encoded.split(".").length === 4 ? { kind: "encrypted", sealed: encoded } : null;
  }
  if (prefix === OPEN_PREFIX) {
    try {
      const json = new TextDecoder().decode(fromBase64Url(encoded.slice(dot + 1)));
      const payload = parsePayload(json);
      return payload ? { kind: "open", payload: stripToken(payload) } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Legacy links with a GitHub token in plain text. */
export function exposesToken(invite: ParsedInvite): boolean {
  return (
    invite.kind === "legacy" &&
    invite.payload.sync.adapter === "github" &&
    Boolean(invite.payload.sync.token)
  );
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function buildInviteUrl(encoded: string): string {
  const base = `${window.location.origin}${__BASE_PATH__}`;
  // Ensure no double slash before query string
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${cleanBase}?join=${encoded}`;
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
  let syncConfig: GitHubConfig | GoogleDriveConfig;

  if (payload.sync.adapter === "github") {
    if (!payload.sync.token) throw new Error("A GitHub token is required to join.");
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

  const profiles = loadProfiles();
  const existing = profiles.find((p) => p.name === payload.profile.name);

  let profileId: string;

  if (existing) {
    profileId = existing.id;
  } else {
    const newProfile: Profile = {
      id: createId(),
      name: payload.profile.name,
      avatar: payload.profile.avatar,
      createdAt: Date.now(),
    };
    addProfile(newProfile);
    profileId = newProfile.id;
  }

  saveSyncConfig(profileId, syncConfig);
  setActiveProfileId(profileId);

  return profileId;
}
