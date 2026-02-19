import type { Snapshot } from "./snapshot";

export interface SyncStateRow {
  key: "last";
  snapshot: Snapshot;
  pushedAt: number;
}
