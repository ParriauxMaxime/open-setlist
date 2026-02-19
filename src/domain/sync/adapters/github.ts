import { snapshotSchema } from "@domain/schemas/snapshot";
import type { GitHubConfig } from "../config";
import { ConflictError, type RemoteSyncPort } from "../ports/remote-sync.port";

function toBase64(str: string): string {
  return btoa(String.fromCodePoint(...new TextEncoder().encode(str)));
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
      const content = fromBase64(data.content.replace(/\n/g, ""));
      const snapshot = snapshotSchema.parse(JSON.parse(content));
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
