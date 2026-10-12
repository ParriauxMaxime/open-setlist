import type { AppDatabase } from "@db";
import type { SongAttachment } from "@db/song";
import { ATTACHMENT_LARGE_BYTES } from "../attachments";
import type { RemoteFilesPort } from "./ports/remote-sync.port";

export interface FileSyncPlan {
  upload: SongAttachment[];
  download: SongAttachment[];
  /** On this device only, and over the size the remote accepts. */
  tooLarge: SongAttachment[];
  /** On neither side yet: the member who added them has not synced their files. */
  unavailable: SongAttachment[];
}

export interface FileSyncResult {
  uploaded: number;
  downloaded: number;
  tooLarge: number;
  unavailable: number;
}

/** Files are write-once under their id, so presence is all there is to compare. */
export function planFileSync(
  attachments: SongAttachment[],
  localIds: Iterable<string>,
  remoteIds: Iterable<string>,
): FileSyncPlan {
  const local = new Set(localIds);
  const remote = new Set(remoteIds);
  const plan: FileSyncPlan = { upload: [], download: [], tooLarge: [], unavailable: [] };
  const seen = new Set<string>();
  for (const attachment of attachments) {
    if (seen.has(attachment.id)) continue;
    seen.add(attachment.id);
    if (local.has(attachment.id)) {
      if (remote.has(attachment.id)) continue;
      if (attachment.size > ATTACHMENT_LARGE_BYTES) plan.tooLarge.push(attachment);
      else plan.upload.push(attachment);
    } else if (remote.has(attachment.id)) plan.download.push(attachment);
    else plan.unavailable.push(attachment);
  }
  return plan;
}

/**
 * Sends the sheet music the remote lacks and fetches the files this device lacks, for the
 * songs as they are now: run it after the snapshot sync.
 */
export async function syncFiles(
  remote: RemoteFilesPort,
  db: Pick<AppDatabase, "songs" | "files">,
): Promise<FileSyncResult> {
  const songs = await db.songs.toArray();
  const attachments = songs.flatMap((song) => song.attachments ?? []);
  const empty = { uploaded: 0, downloaded: 0, tooLarge: 0, unavailable: 0 };
  if (attachments.length === 0) return empty;

  const [localIds, remoteIds] = await Promise.all([
    db.files.toCollection().primaryKeys(),
    remote.list(),
  ]);
  const plan = planFileSync(attachments, localIds, remoteIds);

  for (const { id } of plan.upload) {
    const file = await db.files.get(id);
    if (file) await remote.put(id, file.data);
  }
  let downloaded = 0;
  for (const { id, type } of plan.download) {
    const data = await remote.get(id);
    if (!data) continue;
    await db.files.put({ id, data: new Blob([data], { type }) });
    downloaded++;
  }

  return {
    uploaded: plan.upload.length,
    downloaded,
    tooLarge: plan.tooLarge.length,
    unavailable: plan.unavailable.length + plan.download.length - downloaded,
  };
}
