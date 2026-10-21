import type { Snapshot } from "@db/snapshot";

export interface RemotePullResult {
  snapshot: Snapshot;
  versionToken: string;
}

/** Sheet music files of the band: write-once, addressed by attachment id. */
export interface RemoteFilesPort {
  list(): Promise<string[]>;
  /** null when the remote does not have the file. */
  get(fileId: string): Promise<Blob | null>;
  put(fileId: string, data: Blob): Promise<void>;
}

export interface RemoteSyncPort {
  readonly name: string;
  /** Absent on remotes that only carry the snapshot. */
  readonly files?: RemoteFilesPort;
  isConfigured(): boolean;
  testConnection(): Promise<string>;
  pull(): Promise<RemotePullResult | null>;
  push(snapshot: Snapshot, versionToken: string | null): Promise<string>;
}

/** A refused request: the message is the service's own, the status says what kind. */
export class RemoteHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteHttpError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Remote file changed since last pull") {
    super(message);
    this.name = "ConflictError";
  }
}
