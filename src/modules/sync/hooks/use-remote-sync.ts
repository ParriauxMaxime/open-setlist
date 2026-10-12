import { useDb } from "@db/provider";
import { useActiveProfileId } from "@domain/profiles";
import type { ChangeItem } from "@domain/sync/diff";
import type { ConflictResolutions } from "@domain/sync/merge";
import {
  pullAndDiff,
  pushSelected,
  type SyncResult,
  type SyncReviewContext,
  SyncReviewRequiredError,
} from "@domain/sync/orchestrator";
import type { RemoteSyncPort } from "@domain/sync/ports/remote-sync.port";
import {
  detectTranspositionMismatches,
  type TranspositionMismatch,
} from "@domain/sync/transposition-mismatch";
import { useCallback, useState } from "react";

export type RemoteSyncStatus =
  | { type: "idle" }
  | { type: "authenticating" }
  | { type: "pulling" }
  | { type: "review"; ctx: SyncReviewContext; refreshed?: boolean }
  | { type: "pushing" }
  | { type: "success"; result: SyncResult }
  | { type: "error"; message: string };

interface RemoteSyncOptions {
  /** Adapter of the active profile, or null when it syncs with something else. */
  createAdapter: () => RemoteSyncPort | null;
  /** Runs before the pull, e.g. a sign-in. */
  prepare?: () => Promise<unknown>;
  describeError?: (err: unknown) => string;
  onTranspositionMismatches: (mismatches: TranspositionMismatch[]) => void;
}

function defaultMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

/** The pull → review → push flow of the Sync page, for one remote. */
export function useRemoteSync({
  createAdapter,
  prepare,
  describeError = defaultMessage,
  onTranspositionMismatches,
}: RemoteSyncOptions) {
  const db = useDb();
  const profileId = useActiveProfileId();
  const [status, setStatus] = useState<RemoteSyncStatus>({ type: "idle" });

  // Step 1: pull + diff
  const start = async () => {
    const adapter = createAdapter();
    if (!adapter) return;
    try {
      if (prepare) {
        setStatus({ type: "authenticating" });
        await prepare();
      }
      setStatus({ type: "pulling" });
      const result = await pullAndDiff(adapter, db, profileId);
      setStatus("status" in result ? { type: "success", result } : { type: "review", ctx: result });
    } catch (err) {
      setStatus({ type: "error", message: describeError(err) });
    }
  };

  // Step 2: push selected
  const confirm = async (selectedOutgoing: ChangeItem[], resolutions: ConflictResolutions) => {
    if (status.type !== "review") return;
    const adapter = createAdapter();
    if (!adapter) return;
    const { ctx } = status;
    setStatus({ type: "pushing" });
    try {
      const mismatches = detectTranspositionMismatches(ctx.local.songs, ctx.remote.songs);
      if (mismatches.length > 0) onTranspositionMismatches(mismatches);
      const result = await pushSelected(adapter, db, profileId, ctx, selectedOutgoing, resolutions);
      setStatus({ type: "success", result });
    } catch (err) {
      if (err instanceof SyncReviewRequiredError) {
        setStatus({ type: "review", ctx: err.ctx, refreshed: true });
        return;
      }
      setStatus({ type: "error", message: describeError(err) });
    }
  };

  const reset = useCallback(() => setStatus({ type: "idle" }), []);
  const busy =
    status.type === "authenticating" || status.type === "pulling" || status.type === "pushing";

  return { status, setStatus, start, confirm, reset, busy };
}
