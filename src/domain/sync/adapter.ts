import type { Snapshot } from "@db/snapshot";

export interface StorageAdapter {
  name: string;
  pull(): Promise<Snapshot>;
  push(snapshot: Snapshot): Promise<void>;
  isConfigured(): boolean;
}
