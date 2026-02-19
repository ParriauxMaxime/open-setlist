import type { Snapshot } from "@db/snapshot";

export interface RemotePullResult {
  snapshot: Snapshot;
  versionToken: string;
}

export interface RemoteSyncPort {
  readonly name: string;
  isConfigured(): boolean;
  testConnection(): Promise<string>;
  pull(): Promise<RemotePullResult | null>;
  push(snapshot: Snapshot, versionToken: string | null): Promise<string>;
}

export class ConflictError extends Error {
  constructor(message = "Remote file changed since last pull") {
    super(message);
    this.name = "ConflictError";
  }
}
