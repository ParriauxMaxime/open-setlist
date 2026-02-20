import { requestAccessToken } from "@domain/google-auth";
import { snapshotSchema } from "@domain/schemas/snapshot";
import type { GoogleDriveConfig } from "../config";
import { ConflictError, type RemoteSyncPort } from "../ports/remote-sync.port";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

async function driveHeaders(): Promise<Record<string, string>> {
  const token = await requestAccessToken();
  return { Authorization: `Bearer ${token}` };
}

export function createGoogleDriveAdapter(config: GoogleDriveConfig): RemoteSyncPort {
  const { fileId } = config;

  return {
    name: "Google Drive",

    isConfigured() {
      return Boolean(fileId);
    },

    async testConnection() {
      const headers = await driveHeaders();
      const res = await fetch(`${DRIVE_API}/${fileId}?fields=name`, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || `Drive API error: ${res.status}`);
      }
      const data = await res.json();
      return data.name;
    },

    async pull() {
      const headers = await driveHeaders();

      // Get current revision
      const metaRes = await fetch(`${DRIVE_API}/${fileId}?fields=headRevisionId`, { headers });
      if (!metaRes.ok) {
        if (metaRes.status === 404) return null;
        const body = await metaRes.json().catch(() => ({}));
        throw new Error(body.error?.message || `Drive API error: ${metaRes.status}`);
      }
      const meta = await metaRes.json();
      const versionToken: string = meta.headRevisionId;

      // Get file content
      const contentRes = await fetch(`${DRIVE_API}/${fileId}?alt=media`, { headers });
      if (!contentRes.ok) {
        const body = await contentRes.json().catch(() => ({}));
        throw new Error(body.error?.message || `Drive API error: ${contentRes.status}`);
      }
      const text = await contentRes.text();
      if (!text || text === "{}") return null;
      const snapshot = snapshotSchema.parse(JSON.parse(text));
      return { snapshot, versionToken };
    },

    async push(snapshot, versionToken) {
      const headers = await driveHeaders();

      // Conflict check: verify headRevisionId hasn't changed
      if (versionToken) {
        const metaRes = await fetch(`${DRIVE_API}/${fileId}?fields=headRevisionId`, { headers });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.headRevisionId && meta.headRevisionId !== versionToken) {
            throw new ConflictError();
          }
        }
      }

      // Upload new content
      const content = JSON.stringify(snapshot, null, 2);
      const res = await fetch(`${UPLOAD_API}/${fileId}?uploadType=media&fields=headRevisionId`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: content,
      });
      if (res.status === 409) {
        throw new ConflictError();
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || `Drive API error: ${res.status}`);
      }
      const data = await res.json();
      return data.headRevisionId;
    },
  };
}

export async function createDriveFile(parentFolderId?: string): Promise<string> {
  const token = await requestAccessToken();

  const metadata: Record<string, unknown> = {
    name: "open-setlist.json",
    mimeType: "application/json",
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const boundary = "open_setlist_boundary";
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json\r\n\r\n" +
    "{}\r\n" +
    `--${boundary}--`;

  const res = await fetch(`${UPLOAD_API}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Drive API error: ${res.status}`);
  }

  const data = await res.json();
  return data.id;
}
