import { snapshotSchema } from "@domain/schemas/snapshot";
import type { GitHubConfig } from "../config";
import { ConflictError, type RemoteSyncPort } from "../ports/remote-sync.port";

// Spreading a whole catalog into one call overflows the stack ("Maximum call stack size
// exceeded" from about 50 songs): convert by chunks.
const BASE64_CHUNK = 0x8000;

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createGitHubAdapter(config: GitHubConfig): RemoteSyncPort {
  const { owner, repo, token, path } = config;
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  async function fetchBlob(sha: string): Promise<string> {
    const res = await fetch(`${baseUrl}/git/blobs/${sha}`, { headers });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return (await res.json()).content;
  }

  return {
    name: "GitHub",

    isConfigured() {
      return Boolean(owner && repo && token);
    },

    async testConnection() {
      const res = await fetch(baseUrl, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `GitHub API error: ${res.status}`);
      }
      const data = await res.json();
      return data.full_name;
    },

    async pull() {
      const res = await fetch(`${baseUrl}/contents/${path}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `GitHub API error: ${res.status}`);
      }
      const data = await res.json();
      // Above 1 MB GitHub leaves `content` empty: the blob endpoint has it
      const base64: string = data.content || (await fetchBlob(data.sha));
      const snapshot = snapshotSchema.parse(JSON.parse(fromBase64(base64.replace(/\n/g, ""))));
      return { snapshot, versionToken: data.sha };
    },

    async push(snapshot, versionToken) {
      const content = toBase64(JSON.stringify(snapshot, null, 2));
      const body: Record<string, string> = {
        message: `sync: update setlist data`,
        content,
      };
      if (versionToken) {
        body.sha = versionToken;
      }
      const res = await fetch(`${baseUrl}/contents/${path}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        throw new ConflictError();
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `GitHub API error: ${res.status}`);
      }
      const data = await res.json();
      return data.content.sha;
    },
  };
}
